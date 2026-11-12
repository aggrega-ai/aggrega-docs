# Install Aggrega

Aggrega needs two things: the `aggrega` binary installed, and, to author with an AI assistant, your assistant's client connected to the MCP server the binary carries. The commands come first; what each one does, and the other ways to install, follow them.

## Install the binary

On Linux and macOS, in a terminal:

```bash
curl -fsSL https://aggrega.ai/install.sh | sh
```

On Windows, in PowerShell:

```powershell
irm https://aggrega.ai/install.ps1 | iex
```

With Homebrew, on macOS and Linux:

```bash
brew install aggrega-ai/tap/aggrega
```

With Scoop, on Windows:

```powershell
scoop bucket add aggrega https://github.com/aggrega-ai/scoop-bucket
scoop install aggrega
```

With winget, on Windows:

```powershell
winget install Cognitio.Aggrega
```

Then check that it runs:

```bash
aggrega version
```

A version string means the binary is found and runnable. That is everything the MCP server needs. [Each way to install, in detail](#each-way-to-install-in-detail) says what each command does, where it puts the binary, and how to install with the Windows installer or by hand.

## Connect an MCP client

Your AI assistant's client starts Aggrega's MCP server by running `aggrega mcp`, and [Connect the MCP server](ai-assistants/mcp-server.md) gives the command or the entry that adds it, client by client.

## Each way to install, in detail

Aggrega ships as a single executable. One command installs it; the manual steps after it do the same by hand. Both put it in one folder of your own, the same one each time, and neither needs administrator rights: `~/.local/bin/aggrega` on Linux and macOS, and `%LOCALAPPDATA%\Programs\aggrega\aggrega.exe` on Windows. On Windows, the Windows installer and winget install it into that same folder, also without administrator rights, and list it among your installed apps: see [Install with the Windows installer](#install-with-the-windows-installer) and [Install with winget](#install-with-winget). Homebrew, on macOS and Linux, and Scoop, on Windows, install it too, each into its own folders: see [Install with a package manager](#install-with-a-package-manager).

### Install with one command

The install command is `curl -fsSL https://aggrega.ai/install.sh | sh` on Linux and macOS and `irm https://aggrega.ai/install.ps1 | iex` in PowerShell on Windows, the first two commands of [Install the binary](#install-the-binary). Those two addresses redirect to the install scripts the latest release attaches, so the same commands also run with the release's own addresses:

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
- **It makes the command reachable.** On Linux and macOS, when the folder is not on your `PATH`, it prints a command that adds the folder to the file your shell reads when it starts: `~/.zshrc` for zsh, `~/.bashrc` for bash (`~/.bash_profile` on macOS), `~/.config/fish/config.fish` for fish, with a `fish_add_path` line, and `~/.profile` for any other shell. It does not run that command itself: run it and open a new terminal. On Windows it adds the folder to your user `PATH` when it is not there, and to the `PATH` of the PowerShell window it runs in, so `aggrega` runs in that window and in every terminal opened after it, and it says that it added the folder.
- **It checks that the installed binary runs**, and stops with a message before anything else is set up when it does not. It adds a note when another `aggrega` comes before the one it installed on your `PATH`.
- **It prints the installed version**, running the binary it installed by its full path, so the version shows before your `PATH` reaches the folder.
- **It ends with the next steps**, under `Next:`, one line each: the command that runs the AI quickstart, as [Getting started](getting-started.md#run-quickstart-ai-in-one-command) describes; `aggrega skills install --global`, which adds the Aggrega skill to the AI assistants on your machine, as [Add the assistant skill as you install](#add-the-assistant-skill-as-you-install) describes; and the address of this page, for shell completion and [Connect an MCP client](#connect-an-mcp-client) above. When an option has already installed the skill, its line is left out.

What it prints is short: the version and the system it installs for, a line once the download matches its checksum, and the path it installed. [Getting started](getting-started.md#install-aggrega) shows a whole run. `--verbose`, given after `sh -s --` as the options below are, also prints the address of the checksum list, the name of the release file and the address it downloads it from; `install.ps1` has the same switch as `-Verbose`, for a run of the script with arguments, which `irm … | iex` cannot give it. When the command refuses or a step fails, it says so in one line, on standard error from `install.sh` and as the error or warning PowerShell shows from `install.ps1`:

```text
aggrega install: error: <what went wrong> - <what to do>
```

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

#### Set up shell completion as you install

With `--completion`, `install.sh` also sets up shell completion, so that the Tab key completes `aggrega` commands and flags. Options go after `sh -s --`, which hands them to the script `sh` reads from the pipe:

```bash
curl -fsSL https://aggrega.ai/install.sh | sh -s -- --completion
```

`irm … | iex` passes no option to a script. In PowerShell, set completion up once the install is done, with the script `aggrega completion powershell` writes, as [Shell completion](language-reference/07-cli.md#shell-completion) describes. `install.ps1` takes `-Completion` too, for a run of the script with arguments.

It sets completion up for you alone, without administrator rights, for the shell your `SHELL` setting names, or in PowerShell for the PowerShell it runs in. It uses the script the installed binary's own `aggrega completion` writes, and names every file it writes or changes:

- **bash**: it writes the script into `~/.local/share/bash-completion/completions`, the folder the bash-completion package reads your own completions from. Bash completion for `aggrega` needs that package.
- **zsh**: it writes `_aggrega` into `~/.local/share/zsh/site-functions` and adds three lines to `~/.zshrc` that put that folder on zsh's function path and load it, running `compinit` where nothing in the file ran it first.
- **fish**: it writes `aggrega.fish` into `~/.config/fish/completions`, which fish reads on its own.
- **PowerShell**: it writes the script as `%LOCALAPPDATA%\aggrega\completion.ps1` and adds two lines that load it to your profile for every host of the PowerShell it runs in, `$PROFILE.CurrentUserAllHosts`. Windows PowerShell and PowerShell 7 keep separate profiles, so run it from each one you use. A profile runs only where the execution policy a new window takes is `RemoteSigned`, `Unrestricted` or `Bypass`; under any other, such as `Restricted`, it writes nothing and says which policy it found. It never changes the policy.

`XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `BASH_COMPLETION_USER_DIR` and `ZDOTDIR` move those folders and files as each shell reads them. A new terminal or window loads the completion. Running the command again rewrites a script only when the installed `aggrega` writes a different one, and adds the lines to `~/.zshrc` or the profile only once; that is also how to add completion to an install you already have, since the command installs the binary again on the way.

#### Add the assistant skill as you install

With `--skills` (`-Skills` in PowerShell), the install command also installs the Aggrega skill — the instructions that teach an AI assistant to install and use Aggrega — in every project of yours, for the AI assistants on your machine. Both options can be given together:

```bash
curl -fsSL https://aggrega.ai/install.sh | sh -s -- --completion --skills
```

In PowerShell, where `irm … | iex` passes no option, run `aggrega skills install --global` once the install is done: it is the command `-Skills` runs.

It runs the installed binary's own `aggrega skills install --global`, which looks for the assistants on your machine — each one whose configuration folder is in your home directory, or whose command is on your `PATH` — and prints each one it found and what found it. Then:

- **At a terminal, it asks first.** Press Enter to install the skill for the assistants it found, or type the identifiers of others to add them, separated by spaces or commas; `aggrega skills list` prints the identifiers. Under `curl … | sh` the script reads itself from the pipe, so it asks through your terminal instead.
- **With no terminal to ask through**, as in a script, it installs for the assistants it found.
- **To choose the assistants yourself**, give them after the option, separated by commas: `--skills claude-code,cursor`, or `--skills=claude-code,cursor`, and in PowerShell `-Skills claude-code,cursor`. It then installs for those and looks for no others.

It prints each skill folder it writes, such as `~/.claude/skills/aggrega` for Claude Code, all of them beneath your home directory. Running the command again replaces the copies an earlier run wrote, which is how the skill follows the binary to a newer version. [`aggrega skills`](language-reference/cli/aggrega-skills.md) describes the command, the folder each assistant reads and what finds each one.

#### When a step cannot be done

**When completion cannot be set up** — a shell it does not set up, such as `dash`, a folder it cannot write, or a PowerShell execution policy that runs no profile — **or the skill cannot be installed** — no assistant found and none named, an identifier it does not know, or a file at a skill folder that an installation did not write — the binary is still installed and runs. The command says why the step failed, prints the next steps, and ends with a status saying which step failed. The statuses are:

| Status | Meaning |
|---|---|
| `0` | `aggrega` is installed, and every step an option asked for succeeded |
| `1` | nothing was installed, or the installed `aggrega` did not run |
| `2` | the command was given an option it does not take, or a list naming no assistant; it did nothing |
| `3` | `aggrega` is installed and runs, but setting up shell completion failed |
| `4` | `aggrega` is installed and runs, but installing the skill failed |
| `5` | `aggrega` is installed and runs, but both of those failed |

The PowerShell script never closes the window it runs in, so it leaves the status in `$LASTEXITCODE`, and every status but `0` ends in an error, which `powershell -Command` and `pwsh -Command` report as exit status `1`.

### Install with the Windows installer

Each release carries a Windows installer, `aggrega-<version>-windows-amd64-setup.exe`, on the release page at [https://github.com/aggrega-ai/aggrega-cli/releases](https://github.com/aggrega-ai/aggrega-cli/releases). Download it and run it. It installs the default `aggrega.exe` for you alone, without administrator rights and without asking for them, through a short wizard:

- **A welcome page**, then **the license**, Aggrega's Apache License 2.0: nothing is installed until you press **I Agree**. Then **the components**: Aggrega itself, always installed, and **Add to PATH**, selected.
- **The install folder**, `%LOCALAPPDATA%\Programs\aggrega` unless you choose another; it is the folder the install command uses.
- **The progress**, then **a finish page** naming the folder and saying whether this install added it to your `PATH`, with the next steps: installing the Aggrega skill with `aggrega skills install --global`, and connecting your AI client as [Connect an MCP client](#connect-an-mcp-client) describes.

What it does:

- **With Add to PATH selected, it adds the install folder to your user `PATH`** unless it is there already. A terminal opened after the install finds `aggrega`; one already open keeps the `PATH` it started with. With it cleared, nothing is added to your `PATH`, and a terminal runs `aggrega.exe` by its full path; an entry an earlier install added is left as it is.
- **It lists Aggrega among your installed apps**, published by Cognitio S.r.l., so it is uninstalled from **Settings → Apps** like any other app. The uninstaller asks you to confirm, then removes the files the installer put in the folder, the `PATH` entry and the entry in that list, and removes the folder when nothing else is left in it.
- **Run again, it installs over what is there**, offering the folder it installed into last, so the installer of a later release updates the copy you have, keeping one entry on your `PATH`.
- **Beside `aggrega.exe`, the folder holds `uninstall.exe`**, `LICENSE` with the license text, and `EnVar.dll`, the component the installer and the uninstaller edit your `PATH` with.

When `aggrega.exe` is running — started by an editor or an AI client — the installer cannot replace it, and stops with a message saying so; close what started it and run the installer again. The uninstaller stops the same way, before it has removed anything.

**To install with no window**, from a script or a tool that installs software on many machines, run the installer with `/S`, written in capitals; it then installs without a window or a question, into the folder an earlier install used or else the default one, with **Add to PATH**, and reports a failure through its exit code, which is not `0`. The uninstaller takes the same switch:

```powershell
.\aggrega-<version>-windows-amd64-setup.exe /S
& "$env:LOCALAPPDATA\Programs\aggrega\uninstall.exe" /S
```

The installer is signed as the executables are, with the publisher **Cognitio S.r.l.** and a timestamp: the checks in [The Windows prebuilt binary](#the-windows-prebuilt-binary) apply to it as they do to `aggrega.exe`, and so does what it says about the prompts Windows may show for a downloaded file. `SHA256SUMS` lists its digest as it does every other file of the release.

Where the installer does not suit, the install command above and [the manual steps](#the-windows-prebuilt-binary) install the same `aggrega.exe` into the same folder.

### Install with a package manager

Every release also updates a Homebrew formula and a Scoop manifest, so the package manager you already use can install Aggrega and keep it current. Each installs the same default binary the install command does, checked against the SHA-256 digest the release's `SHA256SUMS` gives it.

On macOS and Linux, `brew install aggrega-ai/tap/aggrega` installs it with [Homebrew](https://brew.sh). Homebrew adds the `aggrega-ai/tap` tap the first time and installs the binary for your system and processor: macOS on Apple silicon or on Intel, Linux on 64-bit x86 or on 64-bit ARM. After a new release, `brew upgrade` updates it, with every other formula you installed.

On Windows, with [Scoop](https://scoop.sh), add the Aggrega bucket once, with `scoop bucket add aggrega https://github.com/aggrega-ai/scoop-bucket`, and install from it with `scoop install aggrega`. Scoop installs the Windows binary as `aggrega.exe` and makes it reachable as `aggrega` through the folder of shims it keeps on your `PATH`. After a new release, `scoop update` refreshes the buckets and `scoop update aggrega` updates it.

Homebrew and Scoop each install into their own folders rather than into `~/.local/bin` or `%LOCALAPPDATA%\Programs\aggrega`, and update only the copy they installed. Use one way of installing on a machine: a copy installed by the install command or by hand and another installed by Homebrew or Scoop are two copies, and whichever folder comes first on your `PATH` decides which one runs.

### Install with winget

On Windows, `winget install Cognitio.Aggrega` installs it with [winget](https://learn.microsoft.com/windows/package-manager/winget/), the Windows Package Manager. winget downloads the [Windows installer](#install-with-the-windows-installer) of the release from its release page, checks it against the SHA-256 digest the package's manifest gives, and runs it unattended. The result is the installer's own: `aggrega.exe` in `%LOCALAPPDATA%\Programs\aggrega`, or in the folder an earlier install used, that folder on your user `PATH`, and Aggrega in your list of installed apps, all without administrator rights. winget does not change the `PATH` of the terminal it runs in, so open a new terminal before running `aggrega version`.

`winget upgrade Cognitio.Aggrega` installs a later release over it, and `winget uninstall Cognitio.Aggrega` runs its uninstaller. winget, the installer and the install command all install into the same folder unless you choose another one in the installer, so whichever runs last puts the `aggrega.exe` there.

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

Confirm the install with `aggrega version`, as at the end of [Install the binary](#install-the-binary).

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
