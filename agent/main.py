"""AgentCore Runtime entry point: serves the butler on 0.0.0.0:8080 (`/ws`, `/ping`, `/invocations`)."""

import logging
import os

from server.app import create_app

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # The Runtime reaches the agent from outside its sandbox, so bind every interface.
    create_app().run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
