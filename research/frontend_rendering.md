# Frontend rendering and interaction research

This note records current platform/library evidence behind Petra's rendering plan. These are engineering sources, not biological evidence.

## PixiJS v8 particle rendering

PixiJS v8 provides `ParticleContainer` / lightweight `Particle` primitives aimed at very large particle counts. Its documentation emphasizes declaring which particle properties are dynamic so static properties avoid unnecessary per-frame GPU uploads.

Implication for Petra:
- use particles for sampled cell glyphs, debris, event sparks and other repeated lightweight visual marks;
- keep simulation density fields authoritative;
- choose dynamic properties conservatively;
- wrap Pixi-specific APIs so a library change does not infect simulation/product code.

Official docs:
- https://pixijs.com/8.x/guides/components/scene-objects/particle-container

## Web Workers and transferables

MDN documents transferable objects such as `ArrayBuffer`, where ownership can move between contexts rather than copying the underlying resource.

Implication:
- authoritative simulation lives in a Worker;
- render snapshots can use transferable buffers;
- design a buffer pool rather than allocating/copying large arrays every frame.

Official docs:
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects

## OffscreenCanvas

MDN describes `OffscreenCanvas` as usable from Web Workers, decoupling canvas work from the DOM/main thread.

Implication:
- keep it as an optimization path if render profiling shows main-thread contention;
- do not complicate the first architecture before measurements justify it.

Official docs:
- https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas

## Motion accessibility

Motion for React exposes both global reduced-motion configuration and a `useReducedMotion` hook. Its accessibility guidance recommends replacing large transform/parallax effects with lower-motion alternatives such as opacity when the user requests reduced motion.

Implication:
- Petra can still retain educational state transitions;
- decorative parallax/camera sweeps should shut off or simplify;
- reduced motion is part of the visual system, not a final patch.

Official docs:
- https://motion.dev/docs/react-accessibility
- https://motion.dev/docs/react-use-reduced-motion

## Three.js

Three.js `WebGLRenderer` targets WebGL 2 in current documentation. Its newer renderer can target WebGPU with fallback.

Implication:
- Three.js is viable for specific 3D explanatory scenes;
- Petra's baseline live dish should remain a 2D/WebGL scientific renderer;
- WebGPU should be progressive enhancement, not a hard requirement.

Official docs:
- https://threejs.org/docs/pages/WebGLRenderer.html
- https://threejs.org/docs/pages/WebGPURenderer.html

## Product conclusion

The cleanest high-quality implementation is:
- DOM/React for accessible controls and provenance;
- Pixi/WebGL for the live dish;
- Web Worker for biology;
- transferables for large snapshots;
- Motion for React for interface/story transitions;
- optional Three.js only for a specific 3D information-rich scene.

This prevents the common failure mode where an impressive 3D stack makes scientific rendering harder while adding little actual explanatory value.
