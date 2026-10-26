# Setup

To author with an AI assistant you need two things: the `aggrega` binary installed, and your MCP-capable client pointed at `aggrega mcp`. The binary is the only prerequisite — the MCP server runs as a subprocess of your client over stdio, reads its schemas from the binary and its documentation pages from a copy it fetches once into your machine's cache, and needs no separate service, port, or account. Where someone else already runs a server for you, you need neither the binary nor any of this: see [A server reached over HTTPS](#a-server-reached-over-https).

## Install the binary

Aggrega ships as a single executable. One command installs it; the manual steps after it do the same by hand. Both put it in one folder of your own, the same one each time, and neither needs administrator rights: `~/.local/bin/aggrega` on Linux and macOS, and `%LOCALAPPDATA%\Programs\aggrega\aggrega.exe` on Windows. On Windows, the Windows installer and winget install it into that same folder, also without administrator rights, and list it among your installed apps: see [Install with the Windows installer](#install-with-the-windows-installer) and [Install with winget](#install-with-winget). Homebrew, on macOS and Linux, and Scoop, on Windows, install it too, each into its own folders: see [Install with a package manager](#install-with-a-package-manager).

### Install with one command

On Linux and macOS, in a terminal:

```bash
curl -fsSL https://aggrega.ai/install.sh | sh
```

On Windows, in PowerShell:

```powershell
irm https://aggrega.ai/install.ps1 | iex
```

Those two addresses redirect to the install scripts the latest release attaches, so the same commands also run with the release's own addresses:

```bash
curl -fsSL https://github.com/aggrega-ai/aggrega-cli/releases/latest/download/install.sh | sh
```

```powershell
irm https://github.com/aggrega-ai/aggrega-cli/releases/latest/download/install.ps1 | iex
```

What the command does:

- **It picks the default binary for your machine** from the latest release: Linux and macOS on 64-bit x86 or 64-bit ARM, Windows on 64-bit x86. It refuses any other system or processor with a message saying which it found or where to turn instead. On a Mac with Apple silicon it picks the Apple silicon binary, even from a shell running through Rosetta 2.
- **It checks the binary against the release's `SHA256SUMS`** before installing anything. A download whose SHA-256 digest differs from the one the list gives is deleted, nothing is installed, and the command stops with a message naming both digests.
- **It installs the binary for you alone**, as `~/.local/bin/aggrega` on Linux and macOS and as `%LOCALAPPDATA%\Programs\aggrega\aggrega.exe` on Windows, creating the folder when it is missing and replacing an earlier copy there in one step, so running the command again updates the one you have. It never uses `sudo`. On Windows it also removes the mark a file downloaded from the internet can carry, as `Unblock-File` does in [the manual steps](#the-windows-prebuilt-binary). On macOS it downloads with `curl`, so the binary it installs carries no quarantine mark (see [The macOS prebuilt binary](#the-macos-prebuilt-binary)).
- **It makes the command reachable.** On Linux and macOS, when the folder is not on your `PATH`, it prints the line that puts it there and names the file your shell reads it from: `~/.zshrc` for zsh, `~/.bashrc` for bash (`~/.bash_profile` on macOS), `~/.config/fish/config.fish` for fish, which takes a `fish_add_path` line, and `~/.profile` for any other shell. It edits none of them: add the line and open a new terminal. On Windows it adds the folder to your user `PATH` when it is not there, and to the `PATH` of the PowerShell window it runs in, so `aggrega` runs in that window and in every terminal opened after it.
- **It prints the installed version** by running the binary, and adds a note when another `aggrega` comes before the one it installed on your `PATH`.

`install.sh`, the Linux and macOS script, needs `curl` or `wget`, `uname`, and `sha256sum` or `shasum`. `install.ps1`, the Windows one, runs in Windows PowerShell 5.1 and in PowerShell 7.

**Two settings change what it installs**, each read from the environment the script runs in:

- **`AGGREGA_VERSION`** names the release to install, such as `0.8.7`, written with or without its leading `v`. Unset, the command installs the latest release — the one GitHub marks as latest, which is never a prerelease, so a prerelease is installed only by naming it here.
- **`AGGREGA_INSTALL_DIR`** names the folder to install into in place of the default. The binary is `aggrega` there, `aggrega.exe` on Windows, and the command makes that folder reachable as above.

On Linux and macOS, put the setting before `sh`, not before `curl`, so that the script receives it:

```bash
curl -fsSL https://aggrega.ai/install.sh | AGGREGA_VERSION=<version> sh
```

In PowerShell, set it in the window first; it stays set there until you remove it with `Remove-Item Env:AGGREGA_VERSION`:

```powershell
$env:AGGREGA_VERSION = "<version>"
irm https://aggrega.ai/install.ps1 | iex
```

### Install with the Windows installer

Each release carries a Windows installer, `aggrega-<version>-windows-amd64-setup.exe`, on the release page at [https://github.com/aggrega-ai/aggrega-cli/releases](https://github.com/aggrega-ai/aggrega-cli/releases). Download it and run it. It installs the default `aggrega.exe` for you alone, without administrator rights and without asking for them:

- **It installs into `%LOCALAPPDATA%\Programs\aggrega`**, the folder the install command uses, and adds that folder to your user `PATH` unless it is there already. A terminal opened after the install finds `aggrega`; one already open keeps the `PATH` it started with.
- **It lists Aggrega among your installed apps**, published by Cognitio S.r.l., so it is uninstalled from **Settings → Apps** like any other app. The uninstaller removes the files the installer put in the folder, the `PATH` entry and the entry in that list, and removes the folder when nothing else is left in it.
- **Run again, it installs over what is there**, so the installer of a later release updates the copy you have, keeping one entry on your `PATH`.
- **Beside `aggrega.exe`, the folder holds `uninstall.exe`** and `EnVar.dll`, the component the installer and the uninstaller edit your `PATH` with.

When `aggrega.exe` is running — started by an editor or an AI client — the installer cannot replace it, and stops with a message saying so; close what started it and run the installer again. The uninstaller stops the same way, before it has removed anything.

**To install with no window**, from a script or a tool that installs software on many machines, run the installer with `/S`, written in capitals; it then installs without a window or a question, and reports a failure through its exit code, which is not `0`. The uninstaller takes the same switch:

```powershell
.\aggrega-<version>-windows-amd64-setup.exe /S
& "$env:LOCALAPPDATA\Programs\aggrega\uninstall.exe" /S
```

The installer is signed as the executables are, with the publisher **Cognitio S.r.l.** and a timestamp: the checks in [The Windows prebuilt binary](#the-windows-prebuilt-binary) apply to it as they do to `aggrega.exe`, and so does what it says about the prompts Windows may show for a downloaded file. `SHA256SUMS` lists its digest as it does every other file of the release.

Where the installer does not suit, the install command above and [the manual steps](#the-windows-prebuilt-binary) install the same `aggrega.exe` into the same folder.

### Install with a package manager

Every release also updates a Homebrew formula and a Scoop manifest, so the package manager you already use can install Aggrega and keep it current. Each installs the same default binary the install command does, checked against the SHA-256 digest the release's `SHA256SUMS` gives it.

On macOS and Linux, with [Homebrew](https://brew.sh):

```bash
brew install aggrega-ai/tap/aggrega
```

Homebrew adds the `aggrega-ai/tap` tap the first time and installs the binary for your system and processor: macOS on Apple silicon or on Intel, Linux on 64-bit x86 or on 64-bit ARM. After a new release, `brew upgrade` updates it, with every other formula you installed.

On Windows, with [Scoop](https://scoop.sh), add the Aggrega bucket once and install from it:

```powershell
scoop bucket add aggrega https://github.com/aggrega-ai/scoop-bucket
scoop install aggrega
```

Scoop installs the Windows binary as `aggrega.exe` and makes it reachable as `aggrega` through the folder of shims it keeps on your `PATH`. After a new release, `scoop update` refreshes the buckets and `scoop update aggrega` updates it.

Homebrew and Scoop each install into their own folders rather than into `~/.local/bin` or `%LOCALAPPDATA%\Programs\aggrega`, and update only the copy they installed. Use one way of installing on a machine: a copy installed by the install command or by hand and another installed by Homebrew or Scoop are two copies, and whichever folder comes first on your `PATH` decides which one runs.

### Install with winget

On Windows, with [winget](https://learn.microsoft.com/windows/package-manager/winget/), the Windows Package Manager:

```powershell
winget install Cognitio.Aggrega
```

winget downloads the [Windows installer](#install-with-the-windows-installer) of the release from its release page, checks it against the SHA-256 digest the package's manifest gives, and runs it unattended. The result is the installer's own: `aggrega.exe` in `%LOCALAPPDATA%\Programs\aggrega`, that folder on your user `PATH`, and Aggrega in your list of installed apps, all without administrator rights. winget does not change the `PATH` of the terminal it runs in, so open a new terminal before running `aggrega version`.

`winget upgrade Cognitio.Aggrega` installs a later release over it, and `winget uninstall Cognitio.Aggrega` runs its uninstaller. winget, the installer and the install command all install into the same folder, so whichever runs last puts the `aggrega.exe` there.

### Install it by hand

Each release carries prebuilt binaries for Linux on 64-bit x86 and on 64-bit ARM, for Windows on 64-bit x86, and for macOS on Apple silicon and on Intel, on the release page at [https://github.com/aggrega-ai/aggrega-cli/releases](https://github.com/aggrega-ai/aggrega-cli/releases). Download the executable for your operating system and processor — [Choosing the file](#choosing-the-file) below names each — and check it against the release's `SHA256SUMS`, as described there. Then mark it executable and move it to `~/.local/bin/aggrega`. On Linux, from the directory the download is in, with `<version>` replaced by the version you downloaded, and `amd64` by `arm64` on 64-bit ARM:

```bash
chmod +x aggrega-<version>-linux-amd64
mkdir -p ~/.local/bin
mv aggrega-<version>-linux-amd64 ~/.local/bin/aggrega
```

On Windows, see [The Windows prebuilt binary](#the-windows-prebuilt-binary) below; on macOS, see [The macOS prebuilt binary](#the-macos-prebuilt-binary).

When `~/.local/bin` is not on your `PATH`, add this line to the file your shell reads when it starts — `~/.zshrc` for zsh, `~/.bashrc` for bash (`~/.bash_profile` on macOS) — and open a new terminal:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

**From source**, with a Go toolchain installed, build the `aggrega` command from the source tree and put the resulting binary in the same folder.

Confirm the install:

```bash
aggrega version
```

A version string means the binary is found and runnable. That is everything the MCP integration needs.

### Choosing the file

A release names each executable `aggrega-<version>-<system>-<processor>`, with `.exe` on Windows:

| System | Processor | File |
|---|---|---|
| Linux | 64-bit x86 (`uname -m` prints `x86_64`) | `aggrega-<version>-linux-amd64` |
| Linux | 64-bit ARM (`uname -m` prints `aarch64`) | `aggrega-<version>-linux-arm64` |
| Windows | 64-bit x86 | `aggrega-<version>-windows-amd64.exe` |
| macOS | Apple silicon | `aggrega-<version>-darwin-arm64` |
| macOS | Intel | `aggrega-<version>-darwin-amd64` |

That file is the one the install command installs, and the one to download by hand. Two variants of it sit beside it; the install command installs neither, and each installs by hand the same way:

- **`aggrega-debug-<version>-…`** is the same program with its debug information, which a debugger or a profiler reads. It runs and reports its version exactly as the default file does, and is larger.
- **`aggrega-light-<version>-…`** is built without the embedded plugins: it resolves every plugin through the plugin cascade, as the workspace configures it, rather than finding the core ones inside itself.

For Windows the release also carries `aggrega-<version>-windows-amd64-setup.exe`, the [Windows installer](#install-with-the-windows-installer), which installs the default file for you.

Each release also carries `SHA256SUMS`, the SHA-256 digest of every other file it attaches, the two install scripts included, in the form `sha256sum` reads. The install command makes this check itself. To check a download by hand on Linux, with `SHA256SUMS` in the same directory:

```bash
sha256sum --check --ignore-missing SHA256SUMS
```

The file you downloaded is reported `OK`; any other report means it is not the file the release published.

### The Windows prebuilt binary

The Windows executable is `aggrega-<version>-windows-amd64.exe` (the debug and light variants beside it in the release install the same way). Rename it to `aggrega.exe`, move it into `%LOCALAPPDATA%\Programs\aggrega`, the folder the install command uses, and add that folder to your user `PATH`: Windows runs a file ending in `.exe` without marking it executable, and finds it as the `aggrega` command under that name. From PowerShell, for example, with `<version>` replaced by the version you downloaded:

```powershell
$dir = "$env:LOCALAPPDATA\Programs\aggrega"
New-Item -ItemType Directory -Force $dir | Out-Null
Move-Item ".\aggrega-<version>-windows-amd64.exe" "$dir\aggrega.exe"
Unblock-File "$dir\aggrega.exe"
[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "User") + ";$dir", "User")
```

A terminal opened after that finds `aggrega`; one already open keeps the `PATH` it started with.

**The executables are signed.** Each carries an Authenticode signature, the code signature Windows checks, and the publisher Windows shows for it is **Cognitio S.r.l.** Each signature also carries a timestamp: the certificate behind a signature is valid for a few days only, and the timestamp is what keeps the signature valid after that certificate expires. To check a downloaded file before you run it:

- **In File Explorer,** open the file's **Properties** and its **Digital Signatures** tab. The signature list names **Cognitio S.r.l.**; select it and then **Details**, which reports *This digital signature is OK.*
- **In PowerShell,** with `$dir` as in the example above:

  ```powershell
  $signature = Get-AuthenticodeSignature "$dir\aggrega.exe"
  $signature.Status
  $signature.SignerCertificate.Subject
  ```

  `Status` reports `Valid`, and the subject begins `CN=Cognitio S.r.l.`. `NotSigned` or `HashMismatch` means the file is not the one the release published, or was changed after it was signed.

A signature names the publisher; it does not make every warning go away. Which one you meet depends on how the file arrived and how you start it:

- **While downloading,** a browser may warn that the file is not commonly downloaded and ask whether to keep it. Keeping it saves the file as downloaded.
- **When you start it from File Explorer** or from the browser, Windows may show *Windows protected your PC*. That prompt comes from Microsoft Defender SmartScreen, which weighs the reputation a file and its publisher have built, so a newly released version can still meet it, signed as it is, until its own reputation builds. For a signed file the prompt names the publisher: select **More info**, check that it names **Cognitio S.r.l.** and the file name you downloaded, then select **Run anyway**. Started from PowerShell or a command prompt instead, the same file may run without that prompt; whether it does depends on the Windows version and its settings.
- **`Unblock-File` answers that prompt in advance.** A downloaded file is marked as coming from the internet, and that mark is what the *Windows protected your PC* check answers to. `Unblock-File` in PowerShell, as in the example above, removes the mark; so does the **Unblock** checkbox on the **General** tab of the file's **Properties** in File Explorer.
- **Where Smart App Control is turned on** (Windows 11), it checks a program when you start it. As Microsoft describes it, Smart App Control first asks Microsoft's cloud security service whether the program is safe; when that service cannot make a confident prediction, it checks the signature, letting a program with a valid signature run and blocking one that is unsigned or whose signature is invalid. Whether it is on is shown under **App & browser control** in Windows Security.

### The macOS prebuilt binary

The macOS executables are `aggrega-<version>-darwin-arm64`, for a Mac with Apple silicon, and `aggrega-<version>-darwin-amd64`, for a Mac with an Intel processor; **About This Mac** in the Apple menu shows which one you have. The debug and light variants beside them in the release install the same way. A Mac with Apple silicon also runs the Intel file, through Rosetta 2 where it is installed, but the Apple silicon file is the one built for it.

Rename the file to `aggrega`, mark it executable, and move it into `~/.local/bin`, the folder the install command uses. From Terminal, in the directory the download is in, for example, with `<version>` replaced by the version you downloaded, and `arm64` by `amd64` on an Intel Mac:

```bash
chmod +x aggrega-<version>-darwin-arm64
mkdir -p ~/.local/bin
mv aggrega-<version>-darwin-arm64 ~/.local/bin/aggrega
```

The `mkdir` creates the folder where it does not exist yet. `~/.local/bin` is not on the `PATH` macOS gives a new terminal, so add the line from [Install it by hand](#install-it-by-hand) to `~/.zshrc`, or to `~/.bash_profile` for bash, unless it is there already.

**The executables are signed and notarized.** Each carries a code signature made with the Developer ID of **Cognitio S.r.l.** — the certificate Apple issues to a developer for software distributed outside the Mac App Store — with the hardened runtime and a secure timestamp, and Apple's notary service has checked each one and notarized it. Gatekeeper, the macOS check on software from the internet, assesses a program that carries the quarantine mark, the mark a web browser adds to a file it downloads, and accepts one that Apple has notarized, so a file downloaded from the release page runs as it is. A notarization ticket cannot be attached to a single executable file, so Gatekeeper finds the ticket online the first time the file runs; on a Mac that is offline at that moment, Gatekeeper may block the file until the Mac can reach Apple.

To check a downloaded file before you run it, from Terminal, with the file name you downloaded:

```bash
codesign --verify --strict --verbose=2 aggrega-<version>-darwin-arm64
codesign --display --verbose=2 aggrega-<version>-darwin-arm64
```

The first reports that the file is *valid on disk* and *satisfies its Designated Requirement*. The second lists the signature's authorities, the first of them `Developer ID Application: Cognitio S.r.l.` followed by the team identifier in parentheses, and a `Timestamp`. A file that fails either is not the one the release published, or was changed after it was signed.

A file fetched with `curl` carries no quarantine mark, so Gatekeeper does not assess it at all: `curl` does not add the mark a browser does. That is also why the binary the install command puts in place runs without that assessment.

## Connect an MCP client

Most MCP-capable clients launch the server the same way — they run the `aggrega` command with a single `mcp` argument and speak the protocol over the process's standard input and output. What differs between them is *where* each keeps its server list and what it calls the entries in it. The common shape:

```json
{
  "mcpServers": {
    "aggrega": {
      "command": "aggrega",
      "args": ["mcp"]
    }
  }
}
```

Once the client restarts and connects, the Aggrega authoring prompts, resources, and tools become available. See [Getting Started](getting-started.md) for what to do with them and the [`aggrega mcp`](../language-reference/cli/aggrega-mcp.md) reference for the command itself.

**Nothing in the entry selects a protocol revision.** Aggrega speaks both `2026-07-28` and `2025-06-18`, on standard input and output and over HTTPS alike, so a client of either connects and reaches the same prompts, resources, and tools. Which one a client asks for is settled on the wire rather than in your configuration.

**An assistant that can run commands can do all of this itself** — install the binary, add the Aggrega skill, and connect to the server — from one prompt you paste into it: see [Use Aggrega from your AI assistant](ai-assistant.md).

### Where each client keeps its server list

| Client | Where the list lives | What the entry is called |
|---|---|---|
| Claude Code | `claude mcp add`, or an `.mcp.json` file in the project | `mcpServers` |
| Claude Desktop | its extension settings for a local server; its connector settings for one reached over HTTPS | see [Claude Desktop](#claude-desktop) |
| Cursor | `.cursor/mcp.json` for one workspace, or a user-scoped `mcp.json` for every workspace | `mcpServers` |
| Gemini CLI | `gemini mcp add`, or `~/.gemini/settings.json` for every project and `.gemini/settings.json` for one | `mcpServers` |
| Codex CLI | `codex mcp add`, or `~/.codex/config.toml` for every project and `.codex/config.toml` for one trusted project | a `[mcp_servers.aggrega]` table — see [Codex CLI](#codex-cli) |
| Zed | Settings → AI → MCP Servers, which writes the entry into Zed's settings file | `context_servers` — see [Zed](#zed) |
| Visual Studio Code | `mcp.json` in your user profile, or `.vscode/mcp.json` for one workspace | `servers` — see [Visual Studio Code](#visual-studio-code) |
| GitHub Copilot CLI | `copilot mcp add`, or the `mcp-config.json` file it keeps in your home directory | `mcpServers` |
| Antigravity | the `mcp_config.json` file reachable from its settings | `mcpServers` |
| Windsurf | the `mcp_config.json` file reachable from its settings | `mcpServers` |
| Cline | its MCP settings, backed by a `cline_mcp_settings.json` file | `mcpServers` |

Every client in that table except the four with a section of their own below takes the entry exactly as written above, at the path in its row. A client not listed connects the same way if it reads a server list of one of these shapes.

### A note on `PATH`

Clients launched from a graphical environment do not always inherit the same `PATH` as your terminal. If a client reports that it cannot find the `aggrega` command, replace `"command": "aggrega"` with the absolute path to the binary (for example `"command": "/home/you/.local/bin/aggrega"`, the install location on Linux for a user named `you`). Everything else stays the same.

### Visual Studio Code

Visual Studio Code keeps its servers under `servers` rather than `mcpServers`, and each entry names the transport it uses:

```json
{
  "servers": {
    "aggrega": {
      "type": "stdio",
      "command": "aggrega",
      "args": ["mcp"]
    }
  }
}
```

### Codex CLI

Codex keeps its servers in TOML rather than JSON — in `~/.codex/config.toml` for every project, or in `.codex/config.toml` for one project Codex trusts — each as a table named after the server:

```toml
[mcp_servers.aggrega]
command = "aggrega"
args = ["mcp"]
```

`codex mcp add aggrega -- aggrega mcp` writes the same table for you. The Codex IDE extension and the ChatGPT desktop app read the same file, so the one entry serves all three.

### Zed

Zed keeps its servers under `context_servers` in its settings file. Add the server from **Settings → AI → MCP Servers** — **Add Server**, then **Add Local Server** — which writes the entry into that file, or run `zed: open settings file` from the command palette and add the entry yourself:

```json
{
  "context_servers": {
    "aggrega": {
      "command": "aggrega",
      "args": ["mcp"]
    }
  }
}
```

Zed supports the protocol's tools and prompts, so its agent reaches Aggrega's tools and authoring prompts but not the resources the server also offers.

### Claude Desktop

Claude Desktop installs a local server from an extension package — the server together with a manifest describing it, bundled into one installable file and added from its extension settings — rather than from an entry in a configuration file. Each Aggrega release carries such a package, `aggrega-<version>.mcpb`, beside its prebuilt binaries.

Aggrega's package carries no program of its own. It launches the `aggrega` executable you name, with the single `mcp` argument, and speaks the protocol over that process's standard input and output — the same server every entry above starts. It starts the file at the path you give it rather than looking `aggrega` up on your `PATH`, and it hands that server the workspace you choose. To add it:

1. Install the `aggrega` binary, as described in [Install the binary](#install-the-binary). The install command and the manual steps there both keep it in a folder of your own — on Windows `%LOCALAPPDATA%\Programs\aggrega` rather than a system folder such as `C:\Windows\System32` — so that you can replace it without administrator rights.
2. Install `aggrega-<version>.mcpb` from Claude Desktop's extension settings.
3. Set the package's two required settings. **Path to the aggrega executable** is the full path of the executable you installed — on macOS and Linux the `aggrega` in `.local/bin` in your home folder, such as `/Users/you/.local/bin/aggrega`; on Windows the full path ending in `aggrega.exe`, such as `C:\Users\you\AppData\Local\Programs\aggrega\aggrega.exe`. **Workspace folder** is the folder of the Aggrega workspace the assistant works in: the folder that holds your project's `.aggrega-config.yaml`. Set both: Claude Desktop saves the settings with **Workspace folder** left empty and starts the server all the same, and the server then answers every request the assistant makes in the workspace with a refusal saying the **Workspace folder** setting is empty and telling you to set it to the folder that holds your workspace's `.aggrega-config.yaml`, rather than working in the folder Claude Desktop started it in.
4. Quit Claude Desktop fully, then start it again. A server the application has already started keeps running, and renaming the executable does not stop it, so a changed setting takes effect only once the application has quit and started again. On Windows, Task Manager shows whether an `aggrega` process is still running.

**The workspace folder is where every request that names no workspace of its own is answered.** Claude Desktop starts the server in a folder of its own choosing rather than in your project, so the package passes the folder you chose to the server as the `AGGREGA_WORKSPACE_ROOT` variable in its environment, rather than as an argument on the command line the application composes. The server takes that folder as the workspace root itself, as `--workspace-root` is taken on every command: it does not look above it for an enclosing workspace, so choose the folder that holds `.aggrega-config.yaml` rather than one inside it. To work in another workspace, change the setting and restart the application as in step 4.

Because the package names no executable of any platform, the same file applies to every platform it declares: macOS, Windows and Linux.

**The server reports which `aggrega` the package launched.** Claude Desktop's extension settings list the package's own version — the version of the release it came from — and not the version of the executable at **Path to the aggrega executable**. The two are installed separately, so they can come from different releases. The package hands the server its own version as the `AGGREGA_BUNDLE_VERSION` variable in its environment, and the server reports both: the answer of `describe-capabilities` called with no arguments — the tool an assistant calls to learn what the server offers — opens with a line naming the executable's version and the package's, and carries the same line as `version_summary` in its structured part, so an assistant asked which version of Aggrega is running can read both there, whichever part of the answer the application hands it. Where the two come from different releases, that line says so, naming both, and the guidance the server hands the assistant when it connects opens with the same sentence. Nothing refuses on a difference, and the server answers every request as usual; it is reported so that you know which executable the package is running. To bring the two together, install the `aggrega-<version>.mcpb` of the release your executable comes from — `aggrega version` at a terminal prints that version — or point **Path to the aggrega executable** at an `aggrega` of the package's release, then restart the application as in step 4.

**Claude Desktop's own logs show what it launched.** On Windows they can sit under a package folder in the local application-data directory rather than under `%APPDATA%\Claude\logs`, even where Claude Desktop was installed from its own download: under `%LOCALAPPDATA%\Packages\`, in the folder whose name begins with `Claude_`, at `LocalCache\Local\Claude\logs`. The files there include `mcp.log` and `mcp-server-Aggrega.log`, the second carrying what the Aggrega server writes to its standard error. A line carrying `Using MCP server command:` names the executable the application started, which is the path in the package's setting. When nothing is at that path, the log carries the Windows command interpreter's message that the path is not recognized as a command, then reports that the server could not start. When the workspace folder is not there — renamed, moved, or never created — the server starts all the same and answers every request the assistant makes in that workspace with its refusal, so the assistant receives the refusal as the answer to its request rather than the application reporting a failure to connect. It names `AGGREGA_WORKSPACE_ROOT` as the variable the package's **Workspace folder** setting sets, and quotes the folder exactly as the application passed it; `mcp-server-Aggrega.log` carries the same refusal. A **Workspace folder** left empty is answered the same way, with the refusal of step 3 naming the empty setting, which the log carries too. Correct the setting and restart the application as in step 4.

Claude Desktop's connector settings are the other route, for a server reached over HTTPS: see [A server reached over HTTPS](#a-server-reached-over-https).

### When a client will not take the whole tool surface

Aggrega announces its whole tool surface and leaves the client to decide how much of it to put in front of the model. Some clients cap how many tools they will register at once and drop the rest. Where that happens, `mcp.announce_tools` shortens what the server announces to the tools you name — see [Narrowing what the server announces](../language-reference/cli/aggrega-mcp.md#narrowing-what-the-server-announces).

### A server reached over HTTPS

Every entry above launches the server itself. A server someone else runs — one long-lived process on a host, serving one workspace — is reached over the network instead, and its entry names an address rather than a command:

```json
{
  "mcpServers": {
    "aggrega": {
      "url": "https://aggrega.example.com/mcp"
    }
  }
}
```

The path is always `/mcp`; the host is whatever the operator published for that server. Ask them for it. Gemini CLI takes the address under `httpUrl` rather than `url`: it reads `url` as a server on the older event-stream transport, and `httpUrl` as one on the streamable HTTP transport, which is the one this server speaks.

**Your client obtains the token, not you.** Nothing about signing in is configured in the entry: the server answers an unauthenticated request by naming the document that says which authorization server issues its tokens, and a client that speaks the protocol's authorization flow reads that document, sends you to sign in, and attaches the token it receives to every later request. The scope names it may ask for are published in that same document. A client that does not implement the flow cannot reach a server of this kind, and nothing you add to the entry substitutes for it.

**A tool your sign-in's scopes do not reach is still in the tool list.** Calling it is refused, naming the scope that would admit it, and a client that implements the protocol's step-up answers that refusal by asking you to sign in again for that scope. A client that does not step up can still be given the write scopes: whoever runs the authorization server makes them default scopes for that client, so its first sign-in already carries them — at the cost that every sign-in through that client then carries write reach. [What a caller may reach](../language-reference/cli/aggrega-mcp.md#what-a-caller-may-reach) sets out what each scope admits, and how that setting behaves for a client that registers itself anew each time it connects.

What such a server requires, and what its operator configures, is in the [`aggrega mcp` reference](../language-reference/cli/aggrega-mcp.md#reaching-the-server-over-https).

## Verify the connection

After the client reconnects, confirm the integration is live: the client should list the Aggrega authoring prompts (one each for the developer, architect and operations roles, plus a per-entity template) and the authoring tools — `scaffold`, `validate`, `describe` and `get-schema` among them. Ask the assistant to scaffold a component, and it should return a skeleton carrying the fields a Component requires. If nothing appears, check that `aggrega version` runs from a terminal and that the client's `command` resolves to the binary — the `PATH` note above covers the common cause.
