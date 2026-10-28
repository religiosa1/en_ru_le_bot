#!/usr/bin/env python3
"""Converts Telegram Desktop HTML chat export pages into a JSONL corpus for examples/lid_eval.rs.

Usage: scripts/export-to-jsonl.py messages*.html > eval/corpus.jsonl

One {"id", "from", "text"} object per line; bot messages and messages without text are skipped.
"""

import json
import re
import sys
from html.parser import HTMLParser

BOT_RE = re.compile(r"\bbot\b|via @", re.IGNORECASE)


class ExportParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.div_classes = []  # classes of currently open divs
        self.message = None
        self.sender = None  # "joined" messages omit the sender, reusing the previous one
        self.capture = None  # "from" or "text" while inside such div, with the div depth it started at

    def handle_starttag(self, tag, attrs):
        if tag == "br" and self.capture:
            self.message[self.capture[0]] += "\n"
        if tag != "div":
            return
        classes = (dict(attrs).get("class") or "").split()
        self.div_classes.append(classes)
        in_forward = any("forwarded" in c for c in self.div_classes[:-1])
        if "message" in classes and "default" in classes:
            if "joined" not in classes:
                self.sender = None
            self.message = {"id": dict(attrs)["id"].removeprefix("message"), "from": "", "text": ""}
        elif self.message is not None and not self.capture:
            if "from_name" in classes and not in_forward:
                self.capture = ("from", len(self.div_classes))
            elif "text" in classes and not self.message["text"]:
                self.capture = ("text", len(self.div_classes))

    def handle_endtag(self, tag):
        if tag != "div" or not self.div_classes:
            return
        if self.capture and self.capture[1] == len(self.div_classes):
            self.capture = None
        classes = self.div_classes.pop()
        if "message" in classes and self.message is not None:
            self.emit()

    def handle_data(self, data):
        if self.capture:
            self.message[self.capture[0]] += data

    def emit(self):
        message, self.message = self.message, None
        if message["from"].strip():
            self.sender = message["from"].strip()
        message["from"] = self.sender
        message["text"] = message["text"].strip()
        if message["text"] and self.sender and not BOT_RE.search(self.sender):
            print(json.dumps(message, ensure_ascii=False))


for path in sys.argv[1:]:
    parser = ExportParser()
    with open(path, encoding="utf-8") as f:
        parser.feed(f.read())
