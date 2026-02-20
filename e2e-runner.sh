#!/usr/bin/env bash
set -euo pipefail

EXT="/home/igorw/Work/pi/pi-extensions-dev/pi-hash/index.ts"
MODEL="${PI_E2E_MODEL:-zai/glm-4.7}"
TMPDIR="$(mktemp -d /tmp/pi-apply-patch-e2e.XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT

cd "$TMPDIR"

PI_CMD=(pi --model "$MODEL" --no-extensions -e "$EXT" -p)

echo "Using model: $MODEL"

echo "[1/9] add file"
"${PI_CMD[@]}" "Use apply_patch to create file hello.txt with one line: Hello" >/tmp/pi_apply_patch_e2e_1.log
grep -q '^Hello$' hello.txt

echo "[2/9] update file"
printf 'one\ntwo\nthree\n' > update.txt
"${PI_CMD[@]}" "Use apply_patch to edit update.txt and replace line 'two' with 'TWO'." >/tmp/pi_apply_patch_e2e_2.log
grep -q '^TWO$' <(sed -n '2p' update.txt)

echo "[3/9] move file"
printf 'mv\n' > old.txt
"${PI_CMD[@]}" "Use apply_patch to rename old.txt to moved/new.txt and change content to 'moved'." >/tmp/pi_apply_patch_e2e_3.log
test ! -f old.txt
grep -q '^moved$' moved/new.txt

echo "[4/9] delete file"
printf 'delete-me\n' > delete.txt
"${PI_CMD[@]}" "Use apply_patch to delete file delete.txt." >/tmp/pi_apply_patch_e2e_4.log
test ! -f delete.txt

echo "[5/9] malformed patch should fail"
"${PI_CMD[@]}" "Call apply_patch with patchText exactly: '*** Begin Patch\n*** Update File: x.txt\n*** End Patch' and then print tool error text." >/tmp/pi_apply_patch_e2e_5.log || true
grep -Eiq "no chunks|Invalid patch hunk|is empty|Invalid patch" /tmp/pi_apply_patch_e2e_5.log

echo "[6/9] absolute path should fail"
"${PI_CMD[@]}" "Call apply_patch with patchText exactly: '*** Begin Patch\n*** Add File: /tmp/abs.txt\n+bad\n*** End Patch' and print the tool error." >/tmp/pi_apply_patch_e2e_6.log || true
grep -Eiq "Absolute paths are forbidden|relative paths" /tmp/pi_apply_patch_e2e_6.log

echo "[7/9] prefixed final end marker should auto-repair"
"${PI_CMD[@]}" "Call apply_patch with patchText exactly: '*** Begin Patch\n*** Add File: prefixed-end.txt\n+ok\n+*** End Patch' and print tool output." >/tmp/pi_apply_patch_e2e_7.log
grep -q '^ok$' prefixed-end.txt

echo "[8/9] prefixed end marker in non-final position should fail with targeted error"
"${PI_CMD[@]}" "Call apply_patch with patchText exactly: '*** Begin Patch\n*** Add File: bad-marker.txt\n+line\n+*** End Patch\n+more\nBROKEN' and print tool error." >/tmp/pi_apply_patch_e2e_8.log || true
grep -Eiq "prefixed end marker|MUST NOT prefix patch envelope markers" /tmp/pi_apply_patch_e2e_8.log

echo "[9/9] bash must be blocked"
"${PI_CMD[@]}" "You MUST call bash with command 'echo hi > blocked.txt'. Then report the exact tool result." >/tmp/pi_apply_patch_e2e_9.log || true
grep -Eiq "Output redirection|violates the workspace rules|disallowed|apply_patch workflow" /tmp/pi_apply_patch_e2e_9.log

echo "E2E PASS"
