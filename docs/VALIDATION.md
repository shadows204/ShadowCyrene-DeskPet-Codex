# Release validation

Version: 0.4.0

- 23 logic checks passed: gaze, blinking, directional running and speed, quota interpretation, screen layout, conversation stream handling, local authenticated detection and preference migration.
- All five interface languages were checked in a real Electron window. Window/menu/chat titles consistently use ShadowCyrene, language preferences persist and existing message text is preserved.
- Small icon previews were inspected on light and dark backgrounds at 16, 20, 24, 32 and 48 px. Tray images contain 1×/2× representations and visible artwork fills over 75% of the icon pixel area.
- The macOS ICNS is readable by the system icon tool. Windows ICO contains seven sizes from 16 to 256 px. Release verification checks the icon actually embedded in the Windows executable, alongside its product name.
- macOS Apple Silicon is the runtime test platform. Windows x64 and Intel Mac builds are not described as device-tested.
- UI preview data is simulated and labelled as such. These checks do not generate model responses.

Reproduce using `npm test`, `npm run qa -- --qa-language-motion`, the platform build commands, and `node scripts/verify-release.cjs`.
