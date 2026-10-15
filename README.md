# Three LiDARs, Twenty-Five Datasets: project page

Project page for the WACV 2027 paper *Three LiDARs, Twenty-Five Datasets: Cross-Source Generalization in
Tree-Species Recognition* (Jae Joong Lee, Bedrich Benes). Code, weights, and the evaluation protocol:
[JaeLee18/FOR20K-lidar-tree-species](https://github.com/JaeLee18/FOR20K-lidar-tree-species).

A static site with no build step: `index.html`, `static/css/style.css`, and `static/js/main.js` (a small canvas
point-cloud renderer, no dependencies besides Google Fonts).

```bash
python3 -m http.server 8000      # preview at http://127.0.0.1:8000
```

**Publishing.** Settings → Pages → Build and deployment → Deploy from a branch → `main`, `/ (root)`. The page is then
served at `https://jaelee18.github.io/wacv27_forspecies20k/`.

**Adding the arXiv link.** In `index.html`, replace the disabled "Paper" button (`class="btn disabled"`) with
`<a class="btn" href="https://arxiv.org/abs/XXXX.XXXXX">` and drop the `<small>arXiv soon</small>` label.

**Contents of `static/`.**

| Path | What it is |
|---|---|
| `media/film.mp4`, `media/poster.jpg` | the 85-second film (720p) and its poster frame |
| `trees/*.bin`, `trees/trees.json` | eight FOR-species20K scans (up to 50,000 points each, int16) and their out-of-fold predictions |
| `img/` | figures from the paper and app screenshots, plus `social.jpg` for link previews |

The point clouds and labels come from [FOR-species20K](https://doi.org/10.5281/zenodo.13255198) (Puliti et al.,
2025) and are distributed under GPL-3.0.
