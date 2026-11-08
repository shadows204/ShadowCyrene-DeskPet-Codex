# Changelog

## 0.5.1

- Fixed invalid macOS signatures left over from the original Electron executable after repackaging. Both macOS architectures now receive a fresh ad-hoc signature and sealed resources.
- The build verifies the complete application after signing and verifies it again after extracting the final ZIP. Invalid signatures now fail the build.
- This is local integrity signing, not Developer ID signing or Apple notarization. Internet downloads may still need an explicit per-app approval in macOS Privacy & Security.

## 0.5.0

- The Chat plus button now adds files or images. Images can also be pasted into the input, and files dropped onto the bar.
- Added removable pending attachment previews. A draft keeps its files when collapsed, disconnected or rejected; only an accepted direct submission clears them.
- Images are sent as real image inputs. PDF/DOCX are converted to text locally; plain text and code files are also supported. Scans without text are rejected with a clear message.
- Attachment limits: 6 per message, 10 MB per file, 20 MB total; PDF up to 100 pages and extracted text up to 80,000 characters per file. PDF/DOCX extraction runs separately from the animation loop.
- Existing settings remain available through the pet's context menu or tray menu. Added five-language attachment labels and screen-corner adaptation for the taller bar.

## 0.4.0

- Unified the application, pet, menus, chat labels and local detection plugin under **ShadowCyrene** in all five languages.
- Replaced the tiny full-body application/tray icon with dedicated portrait icons. Added Retina and Windows icon sizes.
- Preserved existing preferences and the dedicated conversation reference on rename; no credentials or caches are migrated.
- Includes Simplified Chinese, Traditional Chinese, English, French and Japanese, velocity-aware dragging animations, continuous gaze tracking, compact chat, quota display and optional direct conversations.

Windows x64 and macOS Intel packages are built and checked, but have not been tested on those devices.
