# Reset all uses the project registry

`aictx reset --all` operates on projects listed in the user-level project registry. Without `--destroy`, it applies the normal backup-and-clear behavior to each registered project's `.aictx/`; with `--destroy`, it deletes each registered `.aictx/` without backup. Successful resets and already-missing `.aictx/` entries are unregistered, while failed projects remain registered and are reported in the bulk reset result.
