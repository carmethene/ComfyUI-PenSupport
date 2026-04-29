# ComfyUI-PenSupport

Makes the Apple Pencil behave like a mouse in ComfyUI — enabling node selection, lasso, and fine-grained interaction — while leaving finger touch (pan, pinch-zoom) completely unchanged.

## How it works

The browser exposes `pointerType === "pen"` for Apple Pencil contacts. This extension intercepts those events and re-dispatches them as mouse events, bypassing ComfyUI's touch handling.

## Installation

Place the `ComfyUI-PenSupport` folder in your `custom_nodes` directory and restart ComfyUI.

## Settings

| Setting | Default | Description |
|---|---|---|
| PenSupport: Enable Apple Pencil as mouse | On | Master toggle |
| PenSupport: Show input debug overlay | Off | Shows live pointer/touch event data in the corner |

## Requirements

- iOS 13+ / iPadOS 13+ (Pointer Events API)
- Apple Pencil (1st or 2nd generation)
- ComfyUI with a modern frontend
