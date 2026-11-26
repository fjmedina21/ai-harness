# Static project discovery

Discovery reads a host-authorized bounded selection; it executes no project code,
package-manager hooks or model commands. Limits cover depth, file count, individual
and total bytes and elapsed time. Unsafe relative paths, links and inaccessible
manifests cannot silently become successful discovery. Output records signals and
validation units, including ambiguity and incomplete coverage.

Detection signals are data rather than execution authority. Manifest names can
indicate .NET, Node, Java, Python, Go, Rust, PHP, Ruby or C/C++, and host-supplied
signals allow extension. A signal neither proves a toolchain works nor authorizes
an image, executable or network access. Multiple units and conflicting candidates
require explicit host selection; an unknown framework is not an implicit fallback.

No project-local file auto-registers a trusted executable profile. Discovery is
static; it cannot prove dynamic dependency resolution or runtime compatibility.
Filesystem controls retain the existing same-UID hostile parent-path race limitation.
See [profile admission](phase9c-validation-profiles.md).


## Host API

`discoverProjects` accepts `root`, explicit relative `authorizedPaths`, `maxDepth`,
`maxFiles`, `maxFileBytes`, `maxTotalBytes`, `timeoutMs`, optional host `detectors`
and cancellation signal. The result contains validation `units`, static `signals`,
inspected counts, `truncated` and `limitsReached`. Do not treat truncated discovery
as complete coverage. `ProjectDiscoveryError.code` distinguishes unsafe paths,
unreadable inputs, invalid scope/catalog, manifest limits, timeout and cancellation.

Default hard maxima are depth 16, 4,096 inspected entries, 256 KiB per manifest,
4 MiB total and ten seconds. The host should choose smaller project-specific
limits. Hidden/private/generated dependency trees are excluded; this is discovery
coverage, not authorization to read the entire original filesystem.
