# Maintenance command surface split

Only local `.aictx/` reset belongs in the public `aictx` CLI as `aictx reset`. Package version patching is repository package maintenance exposed through `npm run version:patch`, not an `aictx` command.