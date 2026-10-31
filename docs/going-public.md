# Going public: checklist

**Bottom line:** the history has no secrets and no personal data beyond the commit author
email you already chose to keep. Before flipping visibility, do steps 1–4 below (merge the
open PRs, decide on 40 descriptions that break the content rules, turn on the `main` ruleset,
create the labels). Flip in step 5, then do step 6 the same day. Organizations can't claim
records until the gap in step 8 is closed.

Everything here is a proposal: each command changes a repo or org setting, so you run it.
Commands assume `gh` logged in as an org owner and `REPO=getqatalyst/startup-ecosystem`.

```bash
REPO=getqatalyst/startup-ecosystem
```

## 1. Merge the open PRs

1. #2 (`toronto-import`) into `main`.
2. Retarget the PRs based on it to `main`, then merge: #3 issue forms and labels, #4 link
   check and monthly health issues, #5 release downloads, and this checklist.
3. The Massachusetts import and the Toronto research fixes are in their own sessions; merge
   them when ready. Rerun the history scan (section 7) after any branch is pushed.

## 2. Decide on descriptions that break the content rules

CONTRIBUTING.md rule 2 says descriptions carry no dates, amounts, street addresses or
people's names. CI checks only length and HTML, so 40 of the 94 imported descriptions
(`origin/toronto-import`, 2026-10-31) have one or more:

| What | Count | Examples |
| --- | --- | --- |
| Street address | 24 | `obsidi`: "215 Spadina Ave"; `workhaus`: "100 Front St E" |
| Amounts | 10 | `georgian`: "$5.9B AUM"; `golden-ventures`: "$500K-$3M cheques" |
| Years | 18 | `vector-institute`: "Founded 2017"; `radical-ventures`: "Oct 2025" |
| People's names | 4 | `vector-institute` (Hinton, Frey, Urtasun), `nvidia-toronto-ai-lab` (Sanja Fidler), `centre-for-social-innovation` (Tonya Surman), `hxouse` (The Weeknd) |

None is private: they're business addresses and public figures from the orgs' own pages.
They break the rules newcomers will be asked to follow, and the dates and amounts will go
stale. Recommendation: fix them in the Toronto research session before going public (all
are in `data/orgs/ca/on/toronto/`); history doesn't need rewriting. List them with:

```bash
git grep -nE '^desc:.*([0-9]+ [A-Z][a-z]+( [A-Z][a-z]+)? (St|Ave|Rd)|[0-9]+ (Spadina|The Esplanade)|\$[0-9]|(19|20)[0-9]{2}|Hinton|Fidler|Surman|Weeknd)' -- data/orgs
```

A validator warning for digits and `$` in `desc` would stop new ones; that is a
`contract-change:` PR to `scripts/validate.ts`.

## 3. Protect `main` (works while private; the org is on the Team plan)

`main` has no protection today: anyone with write access can push to it or force-push.
Proposed ruleset: pull requests only, squash merge, 1 approval from a code owner, the
`validate` check (job `validate` in `.github/workflows/validate.yml`) must pass, no force
pushes or deletion. Repo admins may bypass through a pull request, so you can merge your own
PRs while you're the only code owner (GitHub never lets a PR's author approve it).

```bash
gh api -X POST "repos/$REPO/rulesets" --input - <<'EOF'
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "require_code_owner_review": true,
        "dismiss_stale_reviews_on_push": true,
        "require_last_push_approval": true,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "validate", "integration_id": 15368 }]
      }
    }
  ]
}
EOF
```

(`actor_id 5` is the Admin role; `integration_id 15368` is GitHub Actions.) Then the merge
settings:

```bash
gh repo edit "$REPO" --enable-squash-merge --enable-merge-commit=false \
  --enable-rebase-merge=false --delete-branch-on-merge --enable-wiki=false --enable-projects=false
```

Workflow token default is already read-only and Actions can't approve PRs; keep both.

## 4. Labels and moderators

1. `bun run labels getqatalyst/startup-ecosystem`. Until then, issues from the forms arrive
   unlabelled (GitHub drops labels that don't exist).
2. Code owners must have write access to the repo. Proposed: one team per province or state
   once it has a moderator, plus a core team:

   | Team | Repo access | Owns |
   | --- | --- | --- |
   | `ecosystem-core` | Maintain | everything; alone on `schema/`, `data/shared/`, `data/regions/`, `scripts/`, `.github/` |
   | `moderators-ca-on` | Write | `data/orgs/ca/on/` |
   | `moderators-us-ma` | Write | `data/orgs/us/ma/` |

   ```bash
   gh api -X POST orgs/getqatalyst/teams -f name=ecosystem-core -f privacy=closed
   gh api -X PUT orgs/getqatalyst/teams/ecosystem-core/repos/$REPO -f permission=maintain
   gh api -X PUT orgs/getqatalyst/teams/ecosystem-core/memberships/jorjani -f role=maintainer
   ```

   Teams hold org members only, and org members are paid seats on the Team plan. A moderator
   from outside Qatalyst can instead be an outside collaborator with Write on this repo,
   listed by handle in CODEOWNERS; on a public repo that needs no seat (check the billing
   page before inviting). Write access is safe only with the ruleset from step 3: without it,
   a moderator can push straight to `main`.
3. Then replace `.github/CODEOWNERS` (a PR; core reviews it):

   ```text
   *                       @getqatalyst/ecosystem-core
   /data/shared/           @getqatalyst/ecosystem-core
   /data/regions/          @getqatalyst/ecosystem-core
   /schema/                @getqatalyst/ecosystem-core
   /scripts/               @getqatalyst/ecosystem-core
   /.github/               @getqatalyst/ecosystem-core
   /data/orgs/ca/on/       @getqatalyst/moderators-ca-on @getqatalyst/ecosystem-core
   /data/orgs/us/ma/       @getqatalyst/moderators-us-ma @getqatalyst/ecosystem-core
   ```

   Any one listed owner's approval satisfies a path, so core can still approve regional PRs.
   The last matching line wins, so the `*` line stays first.
4. Set each city's `moderators` in `data/regions/index.yml` to the same team or handles; the
   monthly health issue CCs them.
5. `williamntlam` has read access today. After going public read access means nothing;
   decide whether they get a role.

## 5. Flip visibility

```bash
gh repo edit "$REPO" --visibility public --accept-visibility-change-consequences
```

What becomes public: every pushed branch and its history, all PRs (#1 onward) with their
comments, Actions run logs, and releases. Local-only branches stay private; never push
`atlas-import` (it holds The Open Accelerator's Slack and SSH deploy tooling).

## 6. The same day

1. Secret scanning and push protection (free on public repos):

   ```bash
   gh repo edit "$REPO" --enable-secret-scanning --enable-secret-scanning-push-protection
   ```

2. Private vulnerability reporting: `gh api -X PUT "repos/$REPO/private-vulnerability-reporting"`.
3. Make every outside contributor's first workflow run wait for approval (can't be set while
   private):

   ```bash
   gh api -X PUT "repos/$REPO/actions/permissions/fork-pr-contributor-approval" \
     -f approval_policy=all_external_contributors
   ```

   Fork PRs run `validate.yml` with a read-only token. Never add a `pull_request_target`
   workflow that checks out PR code; core reviews `.github/` for that.
4. Run the health check once by hand: Actions → Monthly health check → Run workflow. It
   opens one issue per province or state (today: Ontario, Quebec, Connecticut). Check them.
5. Confirm the release: after the first merge to `main`,
   `https://github.com/getqatalyst/startup-ecosystem/releases/latest/download/ecosystem.csv`
   downloads without logging in.
6. GitHub turns off scheduled workflows after 60 days with no commits. If the repo goes quiet,
   re-enable "Monthly health check" in the Actions tab.

## 7. History scan, 2026-10-31

Scanned: every branch on `origin` (`main`, `toronto-import`, `claude/issue-forms`,
`claude/link-health`, `claude/release-downloads`, 8 commits), plus all local branches,
PR #1 and #2 bodies and comments, issues, repo secrets and variables.

| Check | Result |
| --- | --- |
| Secrets (gitleaks 8.30.1, `--log-opts=--all`, 10 commits) | none |
| Repo secrets and variables | none set |
| Files ever committed | code, schema, data, docs only; no `.env`, keys, CSV exports or notes |
| Email addresses in file contents | none |
| Phone numbers | none |
| Local paths (`/Users/...`), hostnames, internal URLs | none |
| PR #1 and #2 bodies and comments | no personal data; no comments on PRs or issues |
| Commit author emails | `d.jorjani@gmail.com` on all 8 pushed commits. Known and deliberate. |
| People's names, street addresses in data | see step 2: public figures and business addresses only |

Rerun after any branch is pushed:

```bash
gitleaks git --log-opts="--remotes=origin" --redact .
git log --remotes=origin --format='%an <%ae>' | sort -u
```

To keep the gmail address out of future commits: set
`git config user.email <id>+jorjani@users.noreply.github.com` and turn on "Block command line
pushes that expose my email" in your GitHub email settings. Past commits keep the address.

## 8. Before organizations can claim records

CONTRIBUTING.md's plan: a person proves they speak for an org with a page or meta tag on one
of its `hosts`, and their record shows `claimed: true`. The gap: proof of control of a host
proves who controls it *now*. A domain the org let lapse can be bought by anyone, who can
then pass the check and edit the record. The 2026-10-31 review found exactly these domains
in the import (one serving gambling spam, one for sale).

Needed before claims open, none of it built yet:

1. **Check the host at claim time.** `scripts/linkcheck.ts`'s `classify()` must return `ok`
   for the host's homepage: not dead, parked, hijacked, moved or unnamed. A host it can't
   read (`blocked`) needs a moderator to look.
2. **Re-check monthly and suspend.** When the monthly health check flags a claimed org's host
   as dead, parked, hijacked or moved, the claim is suspended (`claimed: false`) until a
   moderator re-verifies. The health issue already lists the flagged hosts; the suspension
   step is the missing part.
3. **First claim gets a moderator.** A moderator approves the first claim on each org by hand,
   comparing the claimant's page with the record's history.
4. **Domain age (proposal).** A domain registered after the org's record was added is a
   re-registration. RDAP (the public successor to WHOIS) gives the registration date over
   HTTPS with no account; worth adding to the claim check.
5. **Hosts with a path count only for that path.** For `www.hbs.edu/entrepreneurship`, the
   proof must sit under `/entrepreneurship`. Shared domains (a university's, a hosting
   platform's) never count, as CONTRIBUTING.md already says.

## 9. What changes in CONTRIBUTING.md

Done in the open PRs: the issue-form link (#3), `bun run linkcheck` / `freshness` and the
monthly health issues (#4); README download links (#5).

At go-public time:

1. **Who reviews what:** replace "the core maintainer" with the team names from step 4, and
   say how to become a regional moderator (who to ask, what they review).
2. **Merging:** pull requests need one code owner's approval and a passing `validate` check;
   squash merge only.
3. **Organizations managing their own records (planned):** add that a claim needs the org's
   host to pass the link check, and that a claim is suspended when the monthly check flags
   the host (step 8). Keep "planned" until step 8 is built.
4. **Reporting a problem privately:** one line pointing at the repo's Security tab (private
   vulnerability reporting, step 6). Optional: a `CODE_OF_CONDUCT.md`.
