"""Hidden, single-use key entry. Never print or put a secret in command arguments."""
import getpass
import os
from pathlib import Path

os.umask(0o077)
key = getpass.getpass('New AI Circuit DeepSeek key (hidden): ').strip()
if not key.startswith('sk-') or not 20 < len(key) < 200:
    raise SystemExit('Invalid key format; no file was saved.')
target = Path(__file__).resolve().parent.parent / 'worker' / '.dev.vars'
target.write_text('DEEPSEEK_API_KEY=' + key + '\n')
target.chmod(0o600)
del key
print('AI Circuit backend key saved securely; value hidden.')
