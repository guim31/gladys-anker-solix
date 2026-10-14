# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the e-mail and the password of the Anker account live in the
  Gladys configuration of the integration (the password in a `secret` field).
  The password only leaves the container encrypted, at login (ECDH P-256 key
  exchange with the Anker server, AES-256-CBC), as the Anker app does.
- **`/data`**: one file, `anker-session.json` (mode 600): the session token of
  the Anker cloud, its expiry, the user id, and a hash of the e-mail and
  country to tell accounts apart. Never the e-mail nor the password.
- **Network**: HTTPS requests to the Anker power cloud only
  (`ankerpower-api-eu.anker.com` or `ankerpower-api.anker.com`), and the Gladys
  host API. No listening port, no local network access.
- **Logs**: never the e-mail, the password, the token nor a serial number of
  the account at info level; `LOG_LEVEL=debug` adds the endpoints called,
  never their answers.
- **Writes to the Anker account**: only the usage mode and the output power of
  a Solarbank 2/3, only when "Allow settings" is on.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the Anker cloud and the Anker devices.
