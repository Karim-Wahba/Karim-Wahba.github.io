# karim-wahba.github.io

Personal website of Karim Wahba, built with the [al-folio](https://github.com/alshedivat/al-folio) Jekyll theme (v1.2).
The project page of WISH is a static page in [`wish/`](wish/) and is served at https://karim-wahba.github.io/wish/.

## Deploy
1. Create the empty GitHub repository `Karim-Wahba/Karim-Wahba.github.io` and push this folder to its `main` branch.
2. Repository Settings → Actions → General → Workflow permissions: *Read and write permissions*.
3. The `Deploy site` workflow builds the site into the `gh-pages` branch.
4. Settings → Pages → Build and deployment: *Deploy from a branch*, branch `gh-pages`.

## Edit
- Bio and photo: `_pages/about.md`, `assets/img/prof_pic.jpg`
- Publications: `_bibliography/papers.bib`
- Social links: `_data/socials.yml`
- WISH page: `wish/index.html` (explorer data from `experiments/project_page_explorer.py` in the research repo)
