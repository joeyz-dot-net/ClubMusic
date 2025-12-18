#!/usr/bin/env python3
"""Debug settings reset functionality"""

from models.settings import UserSettings

print("=" * 60)
print("Debug: Testing Settings Reset")
print("=" * 60)

# Create settings instance
settings = UserSettings("user_settings_debug.json")

print(f"\n1. Initial state:")
print(f"   Settings: {settings.get_all()}")

print(f"\n2. Modify settings:")
settings.set("theme", "light")
settings.set("stream_volume", 75)
print(f"   Modified: {settings.get_all()}")

print(f"\n3. Reset settings:")
try:
    result = settings.reset()
    print(f"   Reset result: {result}")
    print(f"   After reset: {settings.get_all()}")
    print("   ✓ SUCCESS")
except Exception as e:
    print(f"   ✗ ERROR: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
