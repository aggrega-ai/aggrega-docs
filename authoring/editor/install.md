# Set up the extension

## Prerequisites

- Visual Studio Code 1.85 or newer, on the desktop. The extension works by starting the `aggrega` program and provides no version a browser can run in its place, so it does not run in editors that run entirely in a web browser, such as vscode.dev and github.dev.
- The `aggrega` compiler, on the machine your workspace is on. The extension runs the one the `aggrega.server.binaryPath` setting names: a path is used as written, and a plain name — the default, `aggrega` — is looked up on `PATH`. Where it finds none, the extension offers to download one for you, and **Aggrega: Select Compiler Version** changes the version later; see [Getting the compiler](#getting-the-compiler).
- A folder Aggrega recognises as a workspace root, at or above the folder you open. Aggrega reads one file at your project root — `.aggrega-config.yaml`, carrying a `workspace:` block — and climbs from the opened folder to find it. Marking the root with a `workspace:` block is the explicit choice and the one to prefer; a project that has never declared one can still be recognised by other markers, which [Aggrega's own configuration reference](../../language-reference/cli/configuration.md) covers along with everything else configuration can do in a larger project.

You do not have to arrange any of that by hand: see [The welcome page](welcome-page.md).

## Getting the compiler

**The extension runs the compiler `aggrega.server.binaryPath` names, and finds one before it offers to
get one.** A path in the setting is used as written. A plain name — the default is `aggrega` — is looked up on your `PATH`, and the Aggrega
output channel says which file that found and the version it reports.

**Where it finds none, it offers to download one** — from the welcome page's compiler step, whose
**Download the compiler** sits beside **Use the compiler on my PATH** and **Point at a compiler I
have**, and from the notification that the language server could not start because nothing is at
the path. Downloading:

- **offers the newest published release this extension works with**, built for the operating system
  and processor of the machine your workspace is on — in a window opened on a remote machine, a
  container or WSL, that machine. Releases carry binaries for Linux and macOS on 64-bit x86 and 64-bit
  ARM, and for Windows on 64-bit x86; on any other machine the download is refused, naming it;
- **proposes the folder Aggrega's install scripts use** — `~/.local/bin` on Linux and macOS,
  `%LOCALAPPDATA%\Programs\aggrega` on Windows — where the compiler is saved as `aggrega`, or
  `aggrega.exe` on Windows, and lets you change it; the version is in the question's title;
- **asks you to confirm** the version and the file before anything is downloaded, then shows progress
  you can stop;
- **checks the file against the release's `SHA256SUMS`**, deleting a download that does not match and
  naming it, makes it executable, and runs it once with `aggrega version -o json`. Only a file that
  passes all three is put in place, and only then is `aggrega.server.binaryPath` set to it, in your own
  settings.

Downloads go through the proxy your editor uses for extensions, as its `http.proxy` and
`http.proxyStrictSSL` settings configure it. Where the release list or a file cannot be read — you are
offline, GitHub is limiting requests from your address, or the request is refused — nothing is
downloaded, the setting is left as it is, and one sentence says why.

**It replaces only a compiler it is entitled to replace:** one in that shared folder, or one it
downloaded itself, which it remembers on that machine in its own storage rather than in a setting.
Asked to download over a compiler you put anywhere else, it says that it never replaces one and offers
the shared folder instead.

**It never upgrades on its own.** For a compiler it may replace, it reads the release list when a
window opens and says, once for each version, that a newer release is available; it asks nothing about
a compiler you pointed it at yourself.

**Aggrega: Select Compiler Version changes the version you run, and keeps it until you change it
again.** It lists the releases this extension works with, newest first, marking the one in use. Before
anything is downloaded it warns that the compiler is the one every workspace on this machine uses, so
the version changes for all of them, and that a Release whose lockfile another version wrote may need
**Pull** run again; you confirm with **Download and switch**. The new version is downloaded beside the
current one and checked as any download is, the language server is started on it, and only then does
it replace the earlier one. Where it does not start the language server, it is deleted, the earlier
one stays, and the language server is started on it again. In a window with no Aggrega workspace open
there is no language server to start, so the version check stands in for it and the message says so.
It replaces a compiler only where a download may; for one you put somewhere yourself, it says so and
offers the shared folder instead.
