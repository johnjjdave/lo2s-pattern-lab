# Code signing policy

Free code signing provided by SignPath.io, certificate by SignPath Foundation.

LO2S Pattern Lab releases are built from the public source repository at <https://github.com/johnjjdave/lo2s-pattern-lab>.

## Roles

- Committers and reviewers: [repository contributors](https://github.com/johnjjdave/lo2s-pattern-lab/graphs/contributors)
- Approvers: [repository owner](https://github.com/johnjjdave)

## Release policy

- Release artifacts must be produced from a tagged commit by the repository's automated Windows build workflow.
- Every signing request requires manual approval by an approver.
- Product name and version metadata must match the GitHub release tag.
- SHA-256 checksums are published alongside downloadable Windows artifacts.

## Privacy policy

The offline desktop program does not transfer information to other networked systems. It reads only files explicitly selected by the user and writes only exports or project files explicitly requested by the user.

The hosted preview is delivered over HTTPS but performs XML parsing, image processing, and pattern rendering locally in the browser.
