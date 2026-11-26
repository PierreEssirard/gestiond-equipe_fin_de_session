# Tenues des avatars étudiants

Les tenues sont des variantes de texture des personnages `assets/s_*.glb` (même maillage, même shader).

```bash
npm i --no-save @gltf-transform/core @gltf-transform/extensions meshoptimizer   # une fois
for m in s_ben s_leonard s_kate s_jody s_megan s_suzie; do node tools/avatars/dump_uv.mjs assets/$m.glb /tmp/av/$m/uv.json; done
python3 tools/avatars/variants.py /tmp/av        # écrit assets/var/*.webp (+ _m pour les téléphones)
```

Les couleurs et les variantes sont dans `variants.py` (`C`, `HAIR`, `SKIN`, `VARIANTS`) ; la liste des tenues
proposées aux joueurs est dans `avatars.js` (`LOOK`, `POOL`). Prénoms → genre : `tools/prenoms/build.py`.
