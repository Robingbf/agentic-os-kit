#!/usr/bin/env python3
"""Fill a scheduler template: render.py <template> <root> <python> <path> [--xml]. Prints the result."""
import sys
from xml.sax.saxutils import escape

template, root, python, path = sys.argv[1:5]
values = {"__ROOT__": root, "__PYTHON__": python, "__PATH__": path}
if "--xml" in sys.argv:
    values = {k: escape(v) for k, v in values.items()}
with open(template, encoding="utf-8") as f:
    text = f.read()
for k, v in values.items():
    text = text.replace(k, v)
sys.stdout.write(text)
