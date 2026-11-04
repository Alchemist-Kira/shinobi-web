import os
import sys

# Ensure server package can be imported
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from server.app import app
from server.suwayomi_client import suwayomi_client

if __name__ == "__main__":
    port = 8787
    print("=" * 60)
    print("   SHINOBI — MANGA & MANHWA READER")
    try:
        print("   Initializing Suwayomi extension engine...")
        suwayomi_client.ensure_server()
        print("   Suwayomi engine is online.")
    except Exception as e:
        print(f"   Note: Suwayomi engine: {e}")
    print(f"   Server running at: http://localhost:{port}")
    print("   Local library: D:\\CP\\Reverse Enginnering\\Call of the Spear")
    print("=" * 60)
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
