
import os

def generate_summary():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ai_context_path = os.path.join(project_root, "AI_CONTEXT.md")
    context_map_path = os.path.join(project_root, "CONTEXT_MAP.md")

    summary = []

    if os.path.exists(ai_context_path):
        with open(ai_context_path, "r", encoding="utf-8") as f:
            summary.append("--- AI_CONTEXT.md ---")
            summary.append(f.read())
            summary.append("\n")

    if os.path.exists(context_map_path):
        with open(context_map_path, "r", encoding="utf-8") as f:
            summary.append("--- CONTEXT_MAP.md ---")
            summary.append(f.read())
            summary.append("\n")

    # Future expansion: add logic to include specific file contents based on CONTEXT_MAP or other criteria
    # For example, reading key files from src/lib/engine based on CONTEXT_MAP

    return "\n".join(summary)

if __name__ == "__main__":
    print(generate_summary())
