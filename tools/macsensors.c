// Lit les capteurs de température des puces Apple (sans droits administrateur) et les imprime en JSON.
// Interface IOHIDEventSystem non documentée par Apple (celle qu'utilisent Stats, iStat…) : peut changer avec macOS.
// Compilation : clang -O2 -framework IOKit -framework CoreFoundation macsensors.c -o macsensors
#include <CoreFoundation/CoreFoundation.h>
#include <stdio.h>

typedef struct __IOHIDEvent *IOHIDEventRef;
typedef struct __IOHIDServiceClient *IOHIDServiceClientRef;
typedef struct __IOHIDEventSystemClient *IOHIDEventSystemClientRef;
IOHIDEventSystemClientRef IOHIDEventSystemClientCreate(CFAllocatorRef);
int IOHIDEventSystemClientSetMatching(IOHIDEventSystemClientRef, CFDictionaryRef);
CFArrayRef IOHIDEventSystemClientCopyServices(IOHIDEventSystemClientRef);
IOHIDEventRef IOHIDServiceClientCopyEvent(IOHIDServiceClientRef, int64_t, int32_t, int64_t);
CFStringRef IOHIDServiceClientCopyProperty(IOHIDServiceClientRef, CFStringRef);
double IOHIDEventGetFloatValue(IOHIDEventRef, int32_t);

#define TEMP_EVENT 15  // kIOHIDEventTypeTemperature

int main(void) {
    int page = 0xff00, usage = 5;  // capteurs de température
    CFNumberRef p = CFNumberCreate(NULL, kCFNumberIntType, &page), u = CFNumberCreate(NULL, kCFNumberIntType, &usage);
    const void *keys[] = {CFSTR("PrimaryUsagePage"), CFSTR("PrimaryUsage")}, *vals[] = {p, u};
    CFDictionaryRef match = CFDictionaryCreate(NULL, keys, vals, 2, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    IOHIDEventSystemClientRef sys = IOHIDEventSystemClientCreate(kCFAllocatorDefault);
    if (!sys) { printf("{}\n"); return 1; }
    IOHIDEventSystemClientSetMatching(sys, match);
    CFArrayRef services = IOHIDEventSystemClientCopyServices(sys);
    printf("{");
    int first = 1;
    for (CFIndex i = 0; services && i < CFArrayGetCount(services); i++) {
        IOHIDServiceClientRef s = (IOHIDServiceClientRef)CFArrayGetValueAtIndex(services, i);
        CFStringRef name = IOHIDServiceClientCopyProperty(s, CFSTR("Product"));
        IOHIDEventRef ev = IOHIDServiceClientCopyEvent(s, TEMP_EVENT, 0, 0);
        if (name && ev) {
            char buf[128];
            if (CFStringGetCString(name, buf, sizeof buf, kCFStringEncodingUTF8)) {
                double t = IOHIDEventGetFloatValue(ev, TEMP_EVENT << 16);
                if (t > 0 && t < 150) { printf("%s\"%s\":%.1f", first ? "" : ",", buf, t); first = 0; }
            }
        }
        if (ev) CFRelease(ev);
        if (name) CFRelease(name);
    }
    printf("}\n");
    return 0;
}
