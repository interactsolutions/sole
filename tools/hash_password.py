#!/usr/bin/env python3
import hashlib, sys

if len(sys.argv) != 2:
    print("Usage: python3 tools/hash_password.py \"YourPassword\"")
    sys.exit(1)

pwd = sys.argv[1].encode("utf-8")
print(hashlib.sha256(pwd).hexdigest())
