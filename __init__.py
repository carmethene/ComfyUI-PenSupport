"""
ComfyUI-PenSupport: Apple Pencil as Mouse

Intercepts Apple Pencil (pen) pointer events and re-dispatches them as
mouse events so ComfyUI treats the pencil like a mouse (fine-select,
lasso, etc.) while finger touch continues to work normally.
"""

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
