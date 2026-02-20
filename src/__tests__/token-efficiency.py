import tiktoken

def count_tokens(text, model="gpt-4o"):
    enc = tiktoken.encoding_for_model(model)
    return len(enc.encode(text))

def format_line(line_no, hash_str, content):
    return f"{line_no}:{hash_str}| {content}\n"

sample_lines = [
    "const user = new User();",
    "if (isReady && !error) {",
    "  return await this.repository.findMany({",
    "    where: { id: userId },",
    "    include: { profile: true }",
    "  });",
    "}",
    "export default function applyPatchExtension(pi: ExtensionAPI) {",
    "  let patchCallsInTurn = 0;",
    "  pi.on('turn_start', () => {",
    "    patchCallsInTurn = 0;",
    "  });",
    "}"
]

print("--- Token Efficiency Report (13 Line Sample) ---")
print(f"{'Format':<25} | {'Tokens':<10} | {'Overhead'}")
print("-" * 55)

# Base: No hashes
base_text = "".join([f"{i+1}| {line}\n" for i, line in enumerate(sample_lines)])
base_tokens = count_tokens(base_text)
print(f"{'No Hash (Standard)':<25} | {base_tokens:<10} | 0%")

# 2-char Hex
hex2_text = "".join([format_line(i+1, "af", line) for i, line in enumerate(sample_lines)])
hex2_tokens = count_tokens(hex2_text)
print(f"{'2-char Hex (af)':<25} | {hex2_tokens:<10} | {((hex2_tokens/base_tokens)-1)*100:.1f}%")

# 4-char Hex
hex4_text = "".join(format_line(i+1, "af32", line) for i, line in enumerate(sample_lines))
hex4_tokens = count_tokens(hex4_text)
print(f"{'4-char Hex (af32)':<25} | {hex4_tokens:<10} | {((hex4_tokens/base_tokens)-1)*100:.1f}%")

# 4-char Base36
b36_text = "".join(format_line(i+1, "z7k2", line) for i, line in enumerate(sample_lines))
b36_tokens = count_tokens(b36_text)
print(f"{'4-char Base36 (z7k2)':<25} | {b36_tokens:<10} | {((b36_tokens/base_tokens)-1)*100:.1f}%")

print("-" * 55)
print("Note: 4-char Base36 provides 6,000x more unique anchors than 2-char Hex")
print("at a token cost of less than 5% relative to standard read output.")

import tiktoken

def count_tokens(text, model="gpt-4o"):
    try:
        enc = tiktoken.encoding_for_model(model)
    except:
        enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))

def format_line(line_no, hash_str, content):
    return f"{line_no}:{hash_str}| {content}\n"

sample_lines = [
    "const user = new User();",
    "if (isReady && !error) {",
    "  return await this.repository.findMany({",
    "    where: { id: userId },",
    "    include: { profile: true }",
    "  });",
    "}",
    "export default function applyPatchExtension(pi: ExtensionAPI) {",
    "  let patchCallsInTurn = 0;",
    "  pi.on('turn_start', () => {",
    "    patchCallsInTurn = 0;",
    "  });",
    "}"
]

def run_report(model_name):
    print(f"\n--- Token Efficiency Report for {model_name} ---")
    print(f"{'Format':<25} | {'Tokens':<10} | {'Overhead'}")
    print("-" * 55)

    base_text = "".join([f"{i+1}| {line}\n" for i, line in enumerate(sample_lines)])
    base_tokens = count_tokens(base_text, model_name)
    print(f"{'Standard read (L|)':<25} | {base_tokens:<10} | 0%")

    # 2-char Hex
    hex2_text = "".join([format_line(i+1, "af", line) for i, line in enumerate(sample_lines)])
    hex2_tokens = count_tokens(hex2_text, model_name)
    print(f"{'2-char Hex (L:hh|)':<25} | {hex2_tokens:<10} | {((hex2_tokens/base_tokens)-1)*100:.1f}%")

    # 4-char Hex
    hex4_text = "".join([format_line(i+1, "af32", line) for i, line in enumerate(sample_lines)])
    hex4_tokens = count_tokens(hex4_text, model_name)
    print(f"{'4-char Hex (L:hhhh|)':<25} | {hex4_tokens:<10} | {((hex4_tokens/base_tokens)-1)*100:.1f}%")

    # 4-char Base36
    b36_text = "".join([format_line(i+1, "z7k2", line) for i, line in enumerate(sample_lines)])
    b36_tokens = count_tokens(b36_text, model_name)
    print(f"{'4-char B36 (L:bbbb|)':<25} | {b36_tokens:<10} | {((b36_tokens/base_tokens)-1)*100:.1f}%")
    print("-" * 55)

run_report("gpt-4o")
run_report("gpt-3.5-turbo")
import tiktoken
import os

def count_tokens(text, model="gpt-4o"):
    try:
        enc = tiktoken.encoding_for_model(model)
    except:
        enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))

def format_line(line_no, hash_str, content):
    return f"{line_no}:{hash_str}| {content}\n"

# Realistic sample (index.ts snippet)
realistic_sample = [
    "import { type ExtensionAPI } from '@mariozechner/pi-coding-agent';",
    "import { Type } from '@sinclair/typebox';",
    "import { APPLY_PATCH_PROMPT_INSTRUCTIONS } from './src/constants.js';",
    "import { detectBashWriteViolation } from './src/bash-guard.js';",
    "import { parsePatch } from './src/parser.js';",
    "import { applyHunks } from './src/apply.js';",
    "import { renderApplyPatchCall, renderApplyPatchResult, formatSummary } from './src/render.js';",
    "",
    "export default function applyPatchExtension(pi: ExtensionAPI) {",
    "  let patchCallsInTurn = 0;",
    "",
    "  pi.on('turn_start', () => {",
    "    patchCallsInTurn = 0;",
    "  });",
    "",
    "  pi.on('session_start', () => {",
    "    const current = new Set(pi.getActiveTools());",
    "    current.add('apply_patch');",
    "    current.delete('edit');",
    "    current.delete('write');",
    "    pi.setActiveTools([...current]);",
    "  });"
]

def run_report(model_name, sample):
    print(f"\n--- Token Efficiency Report for {model_name} ({len(sample)} Lines) ---")
    print(f"{'Format':<25} | {'Tokens':<10} | {'Overhead'}")
    print("-" * 55)

    base_text = "".join([f"{i+1}| {line}\n" for i, line in enumerate(sample)])
    base_tokens = count_tokens(base_text, model_name)
    print(f"{'Standard read (L|)':<25} | {base_tokens:<10} | 0%")

    for name, hash_val in [("2-char Hex", "af"), ("4-char Hex", "af32"), ("4-char B36", "z7k2")]:
        text = "".join([format_line(i+1, hash_val, line) for i, line in enumerate(sample)])
        tokens = count_tokens(text, model_name)
        print(f"{name:<25} | {tokens:<10} | {((tokens/base_tokens)-1)*100:.1f}%")
    print("-" * 55)

run_report("gpt-4o", realistic_sample)
run_report("gpt-3.5-turbo", realistic_sample)
import tiktoken
import os

def count_tokens(text, model="gpt-4o"):
    try:
        enc = tiktoken.encoding_for_model(model)
    except:
        enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))

def format_line(line_no, hash_str, content, sep=":"):
    return f"{line_no}{sep}{hash_str}| {content}\n"

# Realistic sample (index.ts snippet)
realistic_sample = [
    "import { type ExtensionAPI } from '@mariozechner/pi-coding-agent';",
    "import { Type } from '@sinclair/typebox';",
    "import { APPLY_PATCH_PROMPT_INSTRUCTIONS } from './src/constants.js';",
    "import { detectBashWriteViolation } from './src/bash-guard.js';",
    "import { parsePatch } from './src/parser.js';",
    "import { applyHunks } from './src/apply.js';",
    "import { renderApplyPatchCall, renderApplyPatchResult, formatSummary } from './src/render.js';",
    "",
    "export default function applyPatchExtension(pi: ExtensionAPI) {",
    "  let patchCallsInTurn = 0;",
    "",
    "  pi.on('turn_start', () => {",
    "    patchCallsInTurn = 0;",
    "  });",
    "",
    "  pi.on('session_start', () => {",
    "    const current = new Set(pi.getActiveTools());",
    "    current.add('apply_patch');",
    "    current.delete('edit');",
    "    current.delete('write');",
    "    pi.setActiveTools([...current]);",
    "  });"
]

def run_report(model_name, sample):
    print(f"\n--- Token Efficiency Report for {model_name} ({len(sample)} Lines) ---")
    print(f"{'Format':<25} | {'Tokens':<10} | {'Overhead'}")
    print("-" * 55)

    base_text = "".join([f"{i+1}| {line}\n" for i, line in enumerate(sample)])
    base_tokens = count_tokens(base_text, model_name)
    print(f"{'Standard read (L|)':<25} | {base_tokens:<10} | 0%")

    for name, hash_val in [("2-char Hex", "af"), ("4-char Hex", "af32"), ("4-char B36 (sep :)", "z7k2")]:
        text = "".join([format_line(i+1, hash_val, line) for i, line in enumerate(sample)])
        tokens = count_tokens(text, model_name)
        print(f"{name:<25} | {tokens:<10} | {((tokens/base_tokens)-1)*100:.1f}%")
    
    # Test separator optimization
    for sep in ["@", "#", "$", "."]:
        text = "".join([format_line(i+1, "z7k2", line, sep=sep) for i, line in enumerate(sample)])
        tokens = count_tokens(text, model_name)
        print(f"4-char B36 (sep {sep}) | {tokens:<10} | {((tokens/base_tokens)-1)*100:.1f}%")
    print("-" * 55)

run_report("gpt-4o", realistic_sample)
run_report("gpt-3.5-turbo", realistic_sample)
import tiktoken
import os

def count_tokens(text, model="gpt-4o"):
    try:
        enc = tiktoken.encoding_for_model(model)
    except:
        enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))

def format_line(line_no, hash_str, content, sep=".", end="|"):
    return f"{line_no}{sep}{hash_str}{end} {content}\n"

# Realistic sample (index.ts snippet)
realistic_sample = [
    "import { type ExtensionAPI } from '@mariozechner/pi-coding-agent';",
    "import { Type } from '@sinclair/typebox';",
    "import { APPLY_PATCH_PROMPT_INSTRUCTIONS } from './src/constants.js';",
    "import { detectBashWriteViolation } from './src/bash-guard.js';",
    "import { parsePatch } from './src/parser.js';",
    "import { applyHunks } from './src/apply.js';",
    "import { renderApplyPatchCall, renderApplyPatchResult, formatSummary } from './src/render.js';",
    "",
    "export default function applyPatchExtension(pi: ExtensionAPI) {",
    "  let patchCallsInTurn = 0;",
    "",
    "  pi.on('turn_start', () => {",
    "    patchCallsInTurn = 0;",
    "  });",
    "",
    "  pi.on('session_start', () => {",
    "    const current = new Set(pi.getActiveTools());",
    "    current.add('apply_patch');",
    "    current.delete('edit');",
    "    current.delete('write');",
    "    pi.setActiveTools([...current]);",
    "  });"
]

def run_report(model_name, sample):
    print(f"\n--- Token Efficiency Report for {model_name} ({len(sample)} Lines) ---")
    print(f"{'Format':<25} | {'Tokens':<10} | {'Overhead'}")
    print("-" * 55)

    base_text = "".join([f"{i+1}| {line}\n" for i, line in enumerate(sample)])
    base_tokens = count_tokens(base_text, model_name)
    print(f"{'Standard read (L|)':<25} | {base_tokens:<10} | 0%")

    variants = [
        ("2-char Hex (:)", "af", ":", "|"),
        ("4-char Hex (:)", "af32", ":", "|"),
        ("4-char B36 (:)", "z7k2", ":", "|"),
        ("4-char B36 (.)", "z7k2", ".", "|"),
        ("3-char B36 (.)", "z7k", ".", "|"),
        ("3-char B36 (space)", "z7k", " ", "|"),
        ("3-char B36 (no pipe)", "z7k", ".", " "),
        ("3-char B36 (no sep)", "z7k", "", "|"),
    ]

    for name, h, sep, end in variants:
        text = "".join([format_line(i+1, h, line, sep=sep, end=end) for i, line in enumerate(sample)])
        tokens = count_tokens(text, model_name)
        print(f"{name:<25} | {tokens:<10} | {((tokens/base_tokens)-1)*100:.1f}%")
    print("-" * 55)

run_report("gpt-4o", realistic_sample)
run_report("gpt-3.5-turbo", realistic_sample)
import tiktoken
import os

def count_tokens(text, model="gpt-4o"):
    try:
        enc = tiktoken.encoding_for_model(model)
    except:
        enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))

def get_tokens(text, model="gpt-4o"):
    try:
        enc = tiktoken.encoding_for_model(model)
    except:
        enc = tiktoken.get_encoding("cl100k_base")
    return [enc.decode([t]) for t in enc.encode(text)]

def format_line(line_no, hash_str, content, sep=".", end="|", space=" "):
    return f"{line_no}{sep}{hash_str}{end}{space}{content}\n"

def test_tokens(prefix):
    tokens = get_tokens(prefix)
    print(f"Prefix: '{prefix:<10}' -> Tokens: {tokens} (Count: {len(tokens)})")

# Realistic sample (index.ts snippet)
realistic_sample = [
    "import { type ExtensionAPI } from '@mariozechner/pi-coding-agent';",
    "import { Type } from '@sinclair/typebox';",
    "import { APPLY_PATCH_PROMPT_INSTRUCTIONS } from './src/constants.js';",
    "import { detectBashWriteViolation } from './src/bash-guard.js';",
    "import { parsePatch } from './src/parser.js';",
    "import { applyHunks } from './src/apply.js';",
    "import { renderApplyPatchCall, renderApplyPatchResult, formatSummary } from './src/render.js';",
    "",
    "export default function applyPatchExtension(pi: ExtensionAPI) {",
    "  let patchCallsInTurn = 0;",
    "",
    "  pi.on('turn_start', () => {",
    "    patchCallsInTurn = 0;",
    "  });",
    "",
    "  pi.on('session_start', () => {",
    "    const current = new Set(pi.getActiveTools());",
    "    current.add('apply_patch');",
    "    current.delete('edit');",
    "    current.delete('write');",
    "    pi.setActiveTools([...current]);",
    "  });"
]

def run_report(model_name, sample):
    print(f"\n--- Token Efficiency Report for {model_name} ({len(sample)} Lines) ---")
    print(f"{'Format':<25} | {'Tokens':<10} | {'Overhead'}")
    print("-" * 55)

    base_text = "".join([f"{i+1}| {line}\n" for i, line in enumerate(sample)])
    base_tokens = count_tokens(base_text, model_name)
    print(f"{'Standard read (L|)':<25} | {base_tokens:<10} | 0%")

    variants = [
        ("2-char Hex (:)", "af", ":", "|"),
        ("4-char Hex (:)", "af32", ":", "|"),
        ("4-char B36 (:)", "z7k2", ":", "|"),
        ("4-char B36 (.)", "z7k2", ".", "|"),
        ("3-char B36 (.)", "z7k", ".", "|"),
        ("3-char B36 (space)", "z7k", " ", "|"),
        ("3-char B36 (no pipe)", "z7k", ".", " "),
        ("3-char B36 (no sep)", "z7k", "", "|"),
    ]

    for name, h, sep, end in variants:
        text = "".join([format_line(i+1, h, line, sep=sep, end=end) for i, line in enumerate(sample)])
        tokens = count_tokens(text, model_name)
        print(f"{name:<25} | {tokens:<10} | {((tokens/base_tokens)-1)*100:.1f}%")
    print("-" * 55)

run_report("gpt-4o", realistic_sample)

print("\n--- Detailed Token Breakdown (GPT-4o) ---")
test_tokens("42|")
test_tokens("42:af|")
test_tokens("42.z7k|")
test_tokens("42z7k|")
test_tokens("42z7k ")
test_tokens("42.z7k ")
test_tokens("42:z7k ")
import tiktoken
import os

def count_tokens(text, model="gpt-4o"):
    try:
        enc = tiktoken.encoding_for_model(model)
    except:
        enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))

def get_tokens(text, model="gpt-4o"):
    try:
        enc = tiktoken.encoding_for_model(model)
    except:
        enc = tiktoken.get_encoding("cl100k_base")
    return [enc.decode([t]) for t in enc.encode(text)]

def format_line(line_no, hash_str, content, sep=".", end="|", space=" "):
    return f"{line_no}{sep}{hash_str}{end}{space}{content}\n"

def test_tokens(prefix):
    tokens = get_tokens(prefix)
    print(f"Prefix: '{prefix:<10}' -> Tokens: {tokens} (Count: {len(tokens)})")

# Realistic sample (index.ts snippet)
realistic_sample = [
    "import { type ExtensionAPI } from '@mariozechner/pi-coding-agent';",
    "import { Type } from '@sinclair/typebox';",
    "import { APPLY_PATCH_PROMPT_INSTRUCTIONS } from './src/constants.js';",
    "import { detectBashWriteViolation } from './src/bash-guard.js';",
    "import { parsePatch } from './src/parser.js';",
    "import { applyHunks } from './src/apply.js';",
    "import { renderApplyPatchCall, renderApplyPatchResult, formatSummary } from './src/render.js';",
    "",
    "export default function applyPatchExtension(pi: ExtensionAPI) {",
    "  let patchCallsInTurn = 0;",
    "",
    "  pi.on('turn_start', () => {",
    "    patchCallsInTurn = 0;",
    "  });",
    "",
    "  pi.on('session_start', () => {",
    "    const current = new Set(pi.getActiveTools());",
    "    current.add('apply_patch');",
    "    current.delete('edit');",
    "    current.delete('write');",
    "    pi.setActiveTools([...current]);",
    "  });"
]

def run_report(model_name, sample):
    print(f"\n--- Token Efficiency Report for {model_name} ({len(sample)} Lines) ---")
    print(f"{'Format':<25} | {'Tokens':<10} | {'Overhead'}")
    print("-" * 55)

    base_text = "".join([f"{i+1}| {line}\n" for i, line in enumerate(sample)])
    base_tokens = count_tokens(base_text, model_name)
    print(f"{'Standard read (L|)':<25} | {base_tokens:<10} | 0%")

    variants = [
        ("4-char B36 (.)", "z7k2", ".", "|"),
        ("4-digit Dec (.)", "1234", ".", "|"),
        ("4-digit Hex (.)", "a3f2", ".", "|"),
        ("3-char B26 (.)", "abc", ".", "|"),
        ("3-digit Dec (.)", "123", ".", "|"),
        ("5-digit Dec (.)", "12345", ".", "|"),
        ("4-digit Dec (no sep)", "1234", "", "|"),
        ("4-digit Dec (space)", "1234", " ", "|"),
    ]

    for name, h, sep, end in variants:
        text = "".join([format_line(i+1, h, line, sep=sep, end=end) for i, line in enumerate(sample)])
        tokens = count_tokens(text, model_name)
        print(f"{name:<25} | {tokens:<10} | {((tokens/base_tokens)-1)*100:.1f}%")
    print("-" * 55)

run_report("gpt-4o", realistic_sample)

print("\n--- Detailed Token Breakdown (GPT-4o) ---")
test_tokens("42|")
test_tokens("42.123|")
test_tokens("42.1234|")
test_tokens("42.12345|")
test_tokens("42.a3f2|")
test_tokens("42.abc|")
test_tokens("42 1234|")
import tiktoken
import os

def count_tokens(text, model="gpt-4o"):
    try:
        enc = tiktoken.encoding_for_model(model)
    except:
        enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))

def get_tokens(text, model="gpt-4o"):
    try:
        enc = tiktoken.encoding_for_model(model)
    except:
        enc = tiktoken.get_encoding("cl100k_base")
    return [enc.decode([t]) for t in enc.encode(text)]

def format_line(line_no, hash_str, content, sep=".", end="|", space=" "):
    return f"{line_no}{sep}{hash_str}{end}{space}{content}\n"

def test_tokens(prefix):
    tokens = get_tokens(prefix)
    print(f"Prefix: '{prefix:<10}' -> Tokens: {tokens} (Count: {len(tokens)})")

# Realistic sample (index.ts snippet)
realistic_sample = [
    "import { type ExtensionAPI } from '@mariozechner/pi-coding-agent';",
    "import { Type } from '@sinclair/typebox';",
    "import { APPLY_PATCH_PROMPT_INSTRUCTIONS } from './src/constants.js';",
    "import { detectBashWriteViolation } from './src/bash-guard.js';",
    "import { parsePatch } from './src/parser.js';",
    "import { applyHunks } from './src/apply.js';",
    "import { renderApplyPatchCall, renderApplyPatchResult, formatSummary } from './src/render.js';",
    "",
    "export default function applyPatchExtension(pi: ExtensionAPI) {",
    "  let patchCallsInTurn = 0;",
    "",
    "  pi.on('turn_start', () => {",
    "    patchCallsInTurn = 0;",
    "  });",
    "",
    "  pi.on('session_start', () => {",
    "    const current = new Set(pi.getActiveTools());",
    "    current.add('apply_patch');",
    "    current.delete('edit');",
    "    current.delete('write');",
    "    pi.setActiveTools([...current]);",
    "  });"
]

def run_report(model_name, sample):
    print(f"\n--- Token Efficiency Report for {model_name} ({len(sample)} Lines) ---")
    print(f"{'Format':<25} | {'Tokens':<10} | {'Overhead'}")
    print("-" * 55)

    base_text = "".join([f"{i+1}| {line}\n" for i, line in enumerate(sample)])
    base_tokens = count_tokens(base_text, model_name)
    print(f"{'Standard read (L|)':<25} | {base_tokens:<10} | 0%")

    variants = [
        ("3-char B26 (.)", "abc", ".", "|"),
        ("3-char B26 (no sep)", "abc", "", "|"),
        ("4-char B26 (no sep)", "abcd", "", "|"),
    ]

    for name, h, sep, end in variants:
        text = "".join([format_line(i+1, h, line, sep=sep, end=end) for i, line in enumerate(sample)])
        tokens = count_tokens(text, model_name)
        print(f"{name:<25} | {tokens:<10} | {((tokens/base_tokens)-1)*100:.1f}%")
    print("-" * 55)

run_report("gpt-4o", realistic_sample)

print("\n--- Detailed Token Breakdown (GPT-4o) ---")
test_tokens("42|")
test_tokens("42abc|")
test_tokens("42xyz|")
test_tokens("1234abc|")
test_tokens("1234xyz|")
test_tokens("42.abc|")
