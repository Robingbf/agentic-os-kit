"""Machine health for the top bar: temperature, memory, CPU, disk, battery, thermal throttling.

Each reading carries a level: "ok" (green), "warn" (orange), "bad" (red) or "na" (unknown). Thresholds are set here.
No admin rights needed. macOS: system commands + the optional tools/macsensors reader (compiled locally; without it,
temperatures are None). Linux: /proc and /sys. Never raises: anything unreadable becomes None / "na".
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time

SENSORS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools", "macsensors")
IS_MAC = sys.platform == "darwin"
# Thresholds: (warn from, bad from)
TEMP_CHIP = (80, 95)      # °C, CPU cores
TEMP_SSD = (60, 70)       # °C
TEMP_BATT = (40, 45)      # °C
RAM_USED = (80, 92)       # % used (macOS memory pressure wins if it is worse)
CPU_LOAD = (70, 100)      # % of 1-min load average, relative to the number of cores
DISK_FREE = (20, 10)      # % free: warn below 20, bad below 10
BATTERY = (20, 10)        # %: warn below 20, bad below 10 (when not charging)
SWAP_GB = (4, 10)         # GB of swap used
CACHE_S = 10
LEVELS = ["na", "ok", "warn", "bad"]

_cache = {"at": 0, "data": None}


def level(v, warn, bad, low=False):
    if v is None:
        return "na"
    if low:  # lower is worse
        return "bad" if v < bad else "warn" if v < warn else "ok"
    return "bad" if v >= bad else "warn" if v >= warn else "ok"


def run(cmd, timeout=3):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    except (OSError, subprocess.TimeoutExpired):
        return ""


def read(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read().strip()
    except OSError:
        return ""


def sysctl(name):
    return run(["sysctl", "-n", name]).strip()


# ---------- temperatures ----------

def temps_mac():
    if not os.access(SENSORS, os.X_OK):
        return {"chip": None, "chip_avg": None, "ssd": None, "battery": None}
    try:
        s = json.loads(run([SENSORS]) or "{}")
    except ValueError:
        s = {}
    s = {k: v for k, v in s.items() if isinstance(v, (int, float))}
    die = [v for k, v in s.items() if "tdie" in k]
    chip = round(max(die), 1) if die else None
    ssd = next((v for k, v in s.items() if "NAND" in k), None)
    batt = next((v for k, v in s.items() if "battery" in k.lower()), None)
    return {"chip": chip, "chip_avg": round(sum(die) / len(die), 1) if die else None, "ssd": ssd, "battery": batt}


def temps_linux():
    """CPU from hwmon (coretemp / k10temp / cpu_thermal) or thermal zones; SSD from nvme hwmon."""
    cpu, ssd = [], []
    base = "/sys/class/hwmon"
    for h in (os.listdir(base) if os.path.isdir(base) else []):
        name = read(os.path.join(base, h, "name"))
        vals = []
        for f in os.listdir(os.path.join(base, h)):
            if re.fullmatch(r"temp\d+_input", f):
                try:
                    vals.append(int(read(os.path.join(base, h, f))) / 1000)
                except ValueError:
                    pass
        if name in ("coretemp", "k10temp", "zenpower", "cpu_thermal", "soc_thermal"):
            cpu += vals
        elif name == "nvme":
            ssd += vals
    if not cpu:
        zones = "/sys/class/thermal"
        for z in (os.listdir(zones) if os.path.isdir(zones) else []):
            if z.startswith("thermal_zone") and any(k in read(os.path.join(zones, z, "type")).lower() for k in ("cpu", "x86_pkg", "soc", "acpitz")):
                try:
                    cpu.append(int(read(os.path.join(zones, z, "temp"))) / 1000)
                except ValueError:
                    pass
    cpu = [v for v in cpu if 0 < v < 150]
    return {"chip": round(max(cpu), 1) if cpu else None, "chip_avg": round(sum(cpu) / len(cpu), 1) if cpu else None,
            "ssd": round(max(ssd), 1) if ssd else None, "battery": None}


# ---------- memory ----------

def memory_mac():
    total = int(sysctl("hw.memsize") or 0)
    out = run(["vm_stat"])
    m = re.search(r"page size of (\d+)", out)
    page = int(m.group(1)) if m else 16384

    def pages(label):
        x = re.search(rf"{label}:\s+(\d+)", out)
        return int(x.group(1)) if x else 0
    used = (pages("Pages active") + pages("Pages wired down") + pages("Pages occupied by compressor")) * page
    pressure = {"1": "normal", "2": "warn", "4": "critical"}.get(sysctl("kern.memorystatus_vm_pressure_level"), "normal")
    swap = re.search(r"used = ([\d.]+)M", sysctl("vm.swapusage"))
    return {"total_gb": round(total / 2**30) if total else None, "used_pct": round(used / total * 100) if total and out else None,
            "pressure": pressure, "swap_gb": round(float(swap.group(1)) / 1024, 1) if swap else 0}


def memory_linux():
    info = {}
    for line in read("/proc/meminfo").splitlines():
        k, _, v = line.partition(":")
        try:
            info[k] = int(v.split()[0]) * 1024
        except (ValueError, IndexError):
            pass
    total, avail = info.get("MemTotal"), info.get("MemAvailable")
    swap = (info.get("SwapTotal", 0) - info.get("SwapFree", 0)) if "SwapTotal" in info else 0
    used_pct = round((total - avail) / total * 100) if total and avail is not None else None
    # Linux pressure stall info (PSI), when available: share of time some tasks waited on memory
    pressure = "normal"
    m = re.search(r"some avg10=([\d.]+)", read("/proc/pressure/memory"))
    if m:
        pressure = "critical" if float(m.group(1)) >= 40 else "warn" if float(m.group(1)) >= 10 else "normal"
    return {"total_gb": round(total / 2**30) if total else None, "used_pct": used_pct, "pressure": pressure,
            "swap_gb": round(swap / 2**30, 1)}


# ---------- battery ----------

def battery_mac():
    out = run(["pmset", "-g", "batt"])
    m = re.search(r"(\d+)%;\s*([^;]+);\s*([^\s]+)?", out)
    if not m:
        return None  # no battery (desktop Mac)
    return {"pct": int(m.group(1)), "state": m.group(2).strip(), "on_ac": "AC Power" in out, "remaining": (m.group(3) or "").strip()}


def battery_linux():
    base = "/sys/class/power_supply"
    if not os.path.isdir(base):
        return None
    on_ac, bat = False, None
    for d in os.listdir(base):
        p = os.path.join(base, d)
        kind = read(os.path.join(p, "type"))
        if kind == "Mains" and read(os.path.join(p, "online")) == "1":
            on_ac = True
        elif kind == "Battery" and bat is None and read(os.path.join(p, "capacity")).isdigit():
            bat = {"pct": int(read(os.path.join(p, "capacity"))), "state": read(os.path.join(p, "status")).lower() or "unknown"}
    if bat is None:
        return None
    on_ac = on_ac or bat["state"] in ("charging", "full")
    return {**bat, "on_ac": on_ac, "remaining": ""}


# ---------- throttling ----------

def throttling_mac():
    out = run(["pmset", "-g", "therm"])
    limit = re.search(r"CPU_Speed_Limit\s*=\s*(\d+)", out)
    warn = re.search(r"thermal warning level.*?(\d+)", out, re.I)
    return {"cpu_speed_limit": int(limit.group(1)) if limit else 100, "warning": bool(out) and "No thermal warning" not in out and bool(warn)}


def throttling_linux():
    return {"cpu_speed_limit": 100, "warning": False}  # no portable, permission-free source


def disk():
    path = "/System/Volumes/Data" if os.path.exists("/System/Volumes/Data") else os.path.expanduser("~")
    try:
        du = shutil.disk_usage(path)
    except OSError:
        return {"free_pct": None, "free_gb": None, "total_gb": None, "level": "na"}
    free_pct = round(du.free / du.total * 100) if du.total else None
    return {"free_pct": free_pct, "free_gb": round(du.free / 1e9), "total_gb": round(du.total / 1e9), "level": level(free_pct, *DISK_FREE, low=True)}


def cpu():
    cores = os.cpu_count() or 1
    try:
        load = round(os.getloadavg()[0] / cores * 100)
    except (OSError, AttributeError):
        load = None
    return {"load_pct": load, "cores": cores, "level": level(load, *CPU_LOAD)}


def safe(fn, default):
    try:
        return fn()
    except Exception:
        return default


def collect():
    if _cache["data"] and time.time() - _cache["at"] < CACHE_S:
        return _cache["data"]
    no_temp = {"chip": None, "chip_avg": None, "ssd": None, "battery": None}
    no_mem = {"total_gb": None, "used_pct": None, "pressure": "normal", "swap_gb": None}
    no_th = {"cpu_speed_limit": 100, "warning": False}
    if IS_MAC:
        t, m, b, th = safe(temps_mac, no_temp), safe(memory_mac, no_mem), safe(battery_mac, None), safe(throttling_mac, no_th)
    else:
        t, m, b, th = safe(temps_linux, no_temp), safe(memory_linux, no_mem), safe(battery_linux, None), safe(throttling_linux, no_th)
    ram_lvl = level(m["used_pct"], *RAM_USED)
    if m["pressure"] == "critical":
        ram_lvl = "bad"
    elif m["pressure"] == "warn" and ram_lvl in ("ok", "na"):
        ram_lvl = "warn"
    chip_lvl = level(t["chip"], *TEMP_CHIP)
    if th["cpu_speed_limit"] < 100 or th["warning"]:  # the OS is already throttling: at least orange
        chip_lvl = "bad" if th["cpu_speed_limit"] < 70 else max(chip_lvl, "warn", key=LEVELS.index)
    data = {
        "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "platform": "macos" if IS_MAC else sys.platform,
        "temp": {**t, "level": chip_lvl, "ssd_level": level(t["ssd"], *TEMP_SSD), "battery_level": level(t["battery"], *TEMP_BATT)},
        "ram": {**m, "level": ram_lvl, "swap_level": level(m["swap_gb"], *SWAP_GB)},
        "cpu": safe(cpu, {"load_pct": None, "cores": os.cpu_count(), "level": "na"}),
        "disk": safe(disk, {"free_pct": None, "free_gb": None, "total_gb": None, "level": "na"}),
        "battery": ({**b, "level": "ok" if b["on_ac"] else level(b["pct"], *BATTERY, low=True)} if b else None),
        "throttling": th,
    }
    _cache.update(at=time.time(), data=data)
    return data


if __name__ == "__main__":
    print(json.dumps(collect(), ensure_ascii=False, indent=1))
