# Third-party notices

Project-authored source and documentation are provided under the root MIT LICENSE. This grant does not grant rights to third-party trademarks, externally linked content, hosted services, or personal data.

## Supabase JavaScript

Pinned direct dependency: @supabase/supabase-js 2.112.4. License: MIT.
Copyright (c) 2020 Supabase.
Source and upstream license: https://github.com/supabase/supabase-js/blob/master/LICENSE

The dependency is installed using npm ci. The build copies its UMD bundle and license into dist/assets. The full resolved dependency versions are recorded in package-lock.json. Each transitive dependency retains its own license and copyright notices in node_modules; inspect them when redistributing an installed dependency tree.

## Visual assets

The lighthouse icon and scenic backgrounds were generated and edited with AI assistance for this project. Project-provided assets are shared under the project license to the extent the contributors hold rights. They are not official geographic maps or city symbols.

Supabase, Google and Netlify service access is governed by the respective providers' terms. A source-code license does not supply accounts, credits, API keys or service access.

## PGlite (development tests only)

@electric-sql/pglite 0.3.14, Apache-2.0. Copyright Electric DB Limited and contributors. Source and license: https://github.com/electric-sql/pglite. Its PostgreSQL components retain their upstream notices. This dependency runs only the isolated SQL tests and is not copied into the web build.
