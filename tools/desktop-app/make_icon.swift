// Draws the app icon (the brain's central hexagon in the accent colour, on a dark plate) as a PNG of the given size.
import Cocoa
let args = CommandLine.arguments
let size = CGFloat(Double(args[1]) ?? 1024), out = args[2]
let hex = args.count > 3 ? args[3] : "ff7a2f"
func color(_ h: String, _ a: CGFloat = 1) -> NSColor {
    let v = Int(h, radix: 16) ?? 0xff7a2f
    return NSColor(srgbRed: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: a)
}
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8, samplesPerPixel: 4,
                           hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let s = size / 1024
// rounded plate (macOS icon grid: 824 px of content on 1024)
let plate = NSRect(x: 100 * s, y: 100 * s, width: 824 * s, height: 824 * s)
let bg = NSBezierPath(roundedRect: plate, xRadius: 185 * s, yRadius: 185 * s)
NSGradient(starting: NSColor(srgbRed: 0.09, green: 0.105, blue: 0.13, alpha: 1), ending: NSColor(srgbRed: 0.035, green: 0.04, blue: 0.055, alpha: 1))!.draw(in: bg, angle: -90)
color("2a313b").setStroke(); bg.lineWidth = 4 * s; bg.stroke()
// glow
let c = NSPoint(x: 512 * s, y: 512 * s)
NSGradient(colors: [color(hex, 0.35), color(hex, 0)])!.draw(fromCenter: c, radius: 0, toCenter: c, radius: 330 * s, options: [])
// hexagon (point up)
let r = 250 * s
let hexPath = NSBezierPath()
for i in 0..<6 {
    let a = CGFloat.pi / 2 + CGFloat(i) * CGFloat.pi / 3
    let p = NSPoint(x: c.x + r * cos(a), y: c.y + r * sin(a))
    i == 0 ? hexPath.move(to: p) : hexPath.line(to: p)
}
hexPath.close()
color(hex, 0.18).setFill(); hexPath.fill()
color(hex).setStroke(); hexPath.lineWidth = 34 * s; hexPath.lineJoinStyle = .round; hexPath.stroke()
color(hex).setFill(); NSBezierPath(ovalIn: NSRect(x: c.x - 46 * s, y: c.y - 46 * s, width: 92 * s, height: 92 * s)).fill()
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
