// XQL Tutor - exercise bank, part 5: the Acme Life tenant's identity and SaaS sources (units 16-17):
// azure-entra (Entra ID sign-ins and audit, Azure activity) and cross-source (alerts, GitHub EMU, Snowflake, the Data Model).
// Every query runs against js/data/datasets-tenant.js; check with `node test/validate-exercises.js`.
(function (root) {
  const XQL = (root.XQL = root.XQL || {});
  const REF = 'https://cortex-docs.paloaltonetworks.com/xql-command-reference-guide/readme';
  const st = (s, title) => ({ title: title || `${s} stage`, url: `${REF}/stages/${s}` });
  const fn = (f, title) => ({ title: title || `${f}()`, url: `${REF}/functions/${f}` });
  const SRC = 'https://cortex-docs.paloaltonetworks.com/cortex-xsiam/configure-cortex-xsiam/cortex-xsiam-data-sources/vendor-specific-data-sources-and-connectors/microsoft';
  const EVENTHUB = { title: 'Ingest logs from Microsoft Azure Event Hub', url: `${SRC}/azure-event-hub/ingest-logs-from-microsoft-azure-event-hub` };
  const ENTRA = { title: 'Microsoft Entra ID data source', url: `${SRC}/microsoft-entra-id` };
  const XDM = { title: 'XSIAM Data Model schema', url: 'https://cortex-docs.paloaltonetworks.com/xsiam-data-model-schema/readme' };
  const XDM_AUTH = { title: 'XDM fields for authentication events', url: 'https://cortex-docs.paloaltonetworks.com/cortex-xsiam/reference-and-developer-docs/reference/xdm-fields-for-mapping-authentication-events' };
  const XDM_NET = { title: 'XDM fields for network events', url: 'https://cortex-docs.paloaltonetworks.com/cortex-xsiam/reference-and-developer-docs/reference/xdm-fields-for-mapping-network-events' };
  // queries are written indented for readability; Q() strips the indentation (one stage per line)
  const Q = (s) => s.trim().split('\n').map((l) => l.trim()).join('\n');

  XQL.EXERCISES = (XQL.EXERCISES || []).concat([
    // ===================================================================================
    // azure-entra: Entra ID sign-ins and directory audit, Azure activity logs
    // ===================================================================================
    {
      id: 'azure-entra-01', concept: 'azure-entra', type: 'concept', difficulty: 2, title: 'Failed sign-ins by error code',
      query: Q(`
        dataset = msft_azure_ad_raw
        | alter error_code = to_integer(status -> errorCode)
        | filter error_code != 0
        | comp count() as failures by userPrincipalName, error_code
        | sort desc failures`),
      notes: [
        { line: 0, text: 'Entra ID sign-in logs: one row per attempt (interactive, non-interactive and service principal). `status`, `location`, `deviceDetail` and `mfaDetail` are JSON strings.' },
        { line: 1, text: '`status -> errorCode` is shorthand for `json_extract_scalar(status, "$.errorCode")`. It returns text, so `to_integer()` turns the code into a number you can compare; JSON keys are case-sensitive, so `status -> ErrorCode` would be null.' },
        { line: 2, text: '0 means success; any other code is a failed or interrupted attempt. The codes here: 50126 bad password, 500121 MFA failed or denied, 53003 blocked by Conditional Access, 50053 account locked.' },
        { line: 3, text: 'One row per user and code: short, groupable fields instead of the whole JSON document.' },
        { line: 4, text: 's.hudson\'s four 50126 failures (from 192.0.2.199) come first, then administrator\'s two 50126 and s.hudson\'s two 500121 MFA denials; svc_backup has one 53003 and one 50053.' },
      ],
      prompt: 'Why does the query group on `error_code` and not on `status`?',
      choices: [
        '`status` is a whole JSON document (errorCode, failureReason, additionalDetails): grouping on it makes the full text the key, so one code splits into several rows when the details differ, and it cannot be compared as a number',
        '`comp` cannot group on string fields, only on numbers',
        '`status` is an array, so `comp ... by status` is an error',
        '`status` is null on failed sign-ins, so grouping on it would drop them',
      ],
      answer: 0,
      explanation: 'Group on the short field you extracted, not on the JSON blob it came from. `json_extract_scalar()` (and `->`) always return text, so chain `to_integer()` before comparing with numbers; comparing the text with `!= 0` would be a type error.',
      docs: [ENTRA, fn('json_extract_scalar'), fn('to_integer')],
    },
    {
      id: 'azure-entra-02', concept: 'azure-entra', type: 'predict', difficulty: 2, title: 'Non-interactive and service principal sign-ins',
      query: Q(`
        dataset = msft_azure_ad_raw
        | filter isInteractive = false
        | fields _time, category, userPrincipalName, servicePrincipalName, appDisplayName, ipAddress
        | sort asc _time`),
      prompt: 'These are the non-interactive sign-ins. Which row belongs to the s.hudson compromise?',
      choices: [
        'Row 1: the Azure AD Cloud Sync agent from 10.10.1.5',
        'Row 2: the snowflake-oauth-app service principal from 203.0.113.50',
        'Row 3: s.hudson in My Apps from 192.0.2.199, under five minutes after the risky interactive success',
        'None: non-interactive sign-ins reuse an existing token, so they are never part of an attack',
      ],
      answer: 2,
      check: { kind: 'cell', row: 2, column: 'ipAddress', value: '192.0.2.199' },
      explanation: 'Non-interactive sign-ins are a client reusing or refreshing a token the user already has, so after a compromise they show the attacker\'s session carrying on: 20:15:30 from 192.0.2.199 comes right after the 20:10:55 success. The other two are service principals (`category = "ServicePrincipalSignInLogs"`): there is no user, so `userPrincipalName` is null and the identity is in `servicePrincipalName`; a hunt that groups on userPrincipalName lumps every app into one null row.',
      docs: [ENTRA, st('filter')],
    },
    {
      id: 'azure-entra-03', concept: 'azure-entra', type: 'predict', difficulty: 3, title: 'What Conditional Access did to legacy auth',
      query: Q(`
        dataset = msft_azure_ad_raw
        | filter clientAppUsed in ("Exchange ActiveSync", "Other clients")
        | filter conditionalAccessStatus = "failure"
        | alter error_code = to_integer(status -> errorCode)
        | fields _time, userPrincipalName, clientAppUsed, authenticationRequirement, error_code`),
      prompt: 'Four legacy-authentication attempts came from 192.0.2.60. How many rows does this return?',
      choices: ['4: Conditional Access blocks every legacy-auth sign-in', '2: both of svc_backup\'s attempts, the block and the lockout', '1', '0: legacy clients bypass Conditional Access entirely'],
      answer: 2,
      check: { kind: 'rowCount', value: 1 },
      explanation: 'All four attempts failed and all are singleFactorAuthentication (legacy clients cannot do MFA), but only svc_backup\'s 53003 has `conditionalAccessStatus = "failure"`. Entra evaluates Conditional Access only after the first factor succeeds, so administrator\'s bad passwords (50126) and svc_backup\'s lockout (50053) were rejected before it and log `notApplied`. A 53003 therefore means the password was right: treat svc_backup\'s credential as known to the attacker, which matches its Azure activity from the same address earlier that evening.',
      docs: [ENTRA, st('filter')],
    },
    {
      id: 'azure-entra-04', concept: 'azure-entra', type: 'bug', difficulty: 3, title: 'Who changed the NSG rules?',
      prompt: 'This should show who wrote NSG rules in the Acme Life subscription, but it returns nothing. Click the broken line.',
      query: Q(`
        dataset = msft_azure_raw
        | filter operationName ~= "networkSecurityGroups/securityRules/write"
        | fields _time, caller, callerIpAddress, resourceId, properties
        | sort asc _time`),
      bugLine: 1,
      expectError: false,
      fix: Q(`
        dataset = msft_azure_raw
        | filter operationName contains "networkSecurityGroups/securityRules/write"
        | fields _time, caller, callerIpAddress, resourceId, properties
        | sort asc _time`),
      explanation: 'Azure activity logs record `operationName` in upper case (MICROSOFT.NETWORK/NETWORKSECURITYGROUPS/SECURITYRULES/WRITE). `=` and `contains` are case-insensitive by default, but `~=` is a regular expression and stays case-sensitive unless the pattern starts with `(?i)`, so the mixed-case pattern never matches: use `contains`, or prefix the regex with `(?i)`. The one rule write is svc_backup from 192.0.2.60 creating ALLOW-RDP-TEMP (3389 from *).',
      docs: [EVENTHUB, st('filter')],
    },
    {
      id: 'azure-entra-05', concept: 'azure-entra', type: 'parsons', difficulty: 3, title: 'Directory changes without the sync noise',
      task: 'Summarise the Entra audit log by who made each change (the user\'s UPN from `initiatedBy`, or the application\'s display name when an app made it): `changes` (count) and `activities` (distinct activityDisplayName values), most active first, then by actor. Leave out the Azure AD Cloud Sync provisioning rows.',
      solution: Q(`
        dataset = msft_azure_ad_audit_raw
        | filter loggedByService != "Azure AD Cloud Sync"
        | alter actor = coalesce(initiatedBy -> user.userPrincipalName, initiatedBy -> app.displayName)
        | comp count() as changes, values(activityDisplayName) as activities by actor
        | sort desc changes, asc actor`),
      distractors: ['| filter category = "ProvisioningManagement"'],
      explanation: 'Cloud Sync writes an Update user row for synced users every few hours (16 of the 29 rows here), which buries the 13 real changes, so exclude it first. `initiatedBy` holds either a `user` or an `app` object, so `coalesce()` over both paths names every actor: it-admin made 8 changes, s.hudson 3 (all from 192.0.2.199), and the Mail Sync Pro app and a.martin one each.',
      docs: [ENTRA, fn('coalesce'), fn('json_extract_scalar')],
    },
    {
      id: 'azure-entra-06', concept: 'azure-entra', type: 'cloze', difficulty: 3, title: 'Failed Azure operations',
      task: 'List the failed Azure control-plane operations with the status code from the `properties` JSON.',
      template: Q(`
        dataset = msft_azure_raw
        | filter resultType = "___"
        | alter status = properties -> ___
        | fields _time, operationName, caller, callerIpAddress, resourceId, status`),
      answers: [['Failure'], ['statusCode']],
      solution: Q(`
        dataset = msft_azure_raw
        | filter resultType = "Failure"
        | alter status = properties -> statusCode
        | fields _time, operationName, caller, callerIpAddress, resourceId, status`),
      explanation: '`resultType` is Start, Success or Failure (a long-running write logs Start and then Success, like the VM write on 22 Oct); the detail is in the `properties` JSON, whose keys are case-sensitive. The one failure is d.schrute trying to add an access policy to KV-ACME-POLICY-PROD from the office and getting Forbidden: a responder missing a Key Vault permission, not an attack (secret reads themselves are not in the activity log; they go to the Key Vault diagnostic logs).',
      docs: [EVENTHUB, fn('json_extract_scalar')],
    },
    {
      id: 'azure-entra-07', concept: 'azure-entra', type: 'cloze', difficulty: 4, title: 'Role assignments and new app credentials',
      task: 'Privilege changes in Entra: role assignments and new service principal credentials, with who made them, the target and the new value.',
      template: Q(`
        dataset = msft_azure_ad_audit_raw
        | filter activityDisplayName in ("Add member to role", "Add service principal credentials")
        | alter actor = initiatedBy -> ___, target = ___(targetResources, "$[0].displayName"), new_value = targetResources -> [0].modifiedProperties[0].newValue
        | fields _time, activityDisplayName, actor, target, new_value
        | sort asc _time`),
      answers: [['user.userPrincipalName'], ['json_extract_scalar']],
      solution: Q(`
        dataset = msft_azure_ad_audit_raw
        | filter activityDisplayName in ("Add member to role", "Add service principal credentials")
        | alter actor = initiatedBy -> user.userPrincipalName, target = json_extract_scalar(targetResources, "$[0].displayName"), new_value = targetResources -> [0].modifiedProperties[0].newValue
        | fields _time, activityDisplayName, actor, target, new_value
        | sort asc _time`),
      explanation: '`initiatedBy` is an object, so a dotted path walks into it; `targetResources` is a JSON array, so the path starts with an index: `"$[0].displayName"` in `json_extract_scalar()`, or `[0].modifiedProperties[0].newValue` after `->`, which drops the `$`. Escalate the second and third rows: it-admin made a.martin Global Administrator at 21:30, and at 01:10 a.martin added a password credential named backdoor-key to acme-policy-sync, the service principal svc_backup had made Owner of rg-acme-policyapp-prod on 24 Oct. A secret on an app is persistence that survives every user password reset.',
      docs: [ENTRA, fn('json_extract_scalar')],
    },
    {
      id: 'azure-entra-08', concept: 'azure-entra', type: 'write', difficulty: 4, title: 'Sign-ins from outside Australia',
      task: 'Using `location -> countryOrRegion`, find sign-ins whose country is not AU, and exclude the Acme Life GlobalProtect / Prisma Access egress 198.51.100.206 explicitly (cloud egress addresses do not always geolocate where your users are). Per `userPrincipalName`, `ipAddress` and `country` return `signins` (all attempts), `failures` (attempts whose errorCode is not 0), `clients` (distinct clientAppUsed values) and `compliant_device` (distinct `deviceDetail -> isCompliant` values), most sign-ins first, then by userPrincipalName.',
      solution: Q(`
        dataset = msft_azure_ad_raw
        | alter country = location -> countryOrRegion, error_code = to_integer(status -> errorCode), compliant = deviceDetail -> isCompliant
        | filter country != "AU" and ipAddress != "198.51.100.206"
        | alter failed = if(error_code != 0, 1, 0)
        | comp count() as signins, sum(failed) as failures, values(clientAppUsed) as clients, values(compliant) as compliant_device by userPrincipalName, ipAddress, country
        | sort desc signins, asc userPrincipalName`),
      hints: [
        'Stages: `alter` (country, compliance and the error code from the JSON fields), `filter`, `alter` a 1/0 failure flag with `if()`, `comp` with `count()`, `sum()` and `values()`, then `sort`.',
        '`dataset = msft_azure_ad_raw | alter country = location -> ___, error_code = to_integer(status -> errorCode), compliant = deviceDetail -> ___ | filter country != "AU" and ipAddress != "198.51.100.206" | alter failed = if(___, 1, 0) | comp ... by userPrincipalName, ipAddress, country | sort desc signins, asc userPrincipalName`',
        '`... | comp count() as signins, sum(failed) as failures, values(clientAppUsed) as clients, values(compliant) as compliant_device by userPrincipalName, ipAddress, country | sort desc signins, asc userPrincipalName`',
      ],
      explanation: 'Three identities, none on a compliant device: s.hudson from 192.0.2.199 in Nigeria (8 sign-ins: 6 failures, then a success with riskLevelDuringSignIn high and its non-interactive follow-up, the spray that worked), and administrator and svc_backup from 192.0.2.60 in China over legacy clients (Exchange ActiveSync, Other clients) that cannot do MFA. Summing a 1/0 flag is the standard way to count a subset inside comp; the home workers on 198.51.100.206 are Acme Life staff signing in with MFA from compliant devices.',
      docs: [ENTRA, fn('if'), fn('sum_with_comp_stage', 'sum()'), fn('values')],
    },
    {
      id: 'azure-entra-09', concept: 'azure-entra', type: 'write', difficulty: 5, title: 'The consent-phishing chain',
      task: 'After the risky sign-in, the attacker consented to an app called Mail Sync Pro. Return the Entra audit events (Cloud Sync rows excluded) made from 192.0.2.199 or by the Mail Sync Pro application: `_time`, `activityDisplayName`, `actor` (the user\'s UPN from `initiatedBy`, or the app\'s displayName when an app made the change), `actor_ip` (`initiatedBy -> user.ipAddress`) and `target` (displayName of the first entry in `targetResources`), oldest first.',
      solution: Q(`
        dataset = msft_azure_ad_audit_raw
        | filter loggedByService != "Azure AD Cloud Sync"
        | alter actor = coalesce(initiatedBy -> user.userPrincipalName, initiatedBy -> app.displayName), actor_ip = initiatedBy -> user.ipAddress, target = targetResources -> [0].displayName
        | filter actor_ip = "192.0.2.199" or actor = "Mail Sync Pro"
        | fields _time, activityDisplayName, actor, actor_ip, target
        | sort asc _time`),
      hints: [
        'Stages: `filter` out Cloud Sync, `alter` actor / actor_ip / target from the JSON fields, `filter` on the new fields, `fields`, `sort asc _time`.',
        '`... | alter actor = coalesce(initiatedBy -> ___, initiatedBy -> ___), actor_ip = initiatedBy -> user.ipAddress, target = targetResources -> ___ | filter actor_ip = "192.0.2.199" or actor = "Mail Sync Pro" | fields ... | sort asc _time` (`targetResources` is an array, so the path starts with an index; `json_extract_scalar(targetResources, "$[0]...")` works too)',
        '`dataset = msft_azure_ad_audit_raw | filter loggedByService != "Azure AD Cloud Sync" | alter actor = coalesce(initiatedBy -> user.userPrincipalName, initiatedBy -> app.displayName), actor_ip = initiatedBy -> user.ipAddress, target = targetResources -> [0].displayName | filter ... | fields _time, activityDisplayName, actor, actor_ip, target | sort asc _time`',
      ],
      explanation: 'Four steps in under four minutes: Consent to application (Mail.ReadWrite, Mail.Send, offline_access), Add app role assignment grant, the app itself updating s.hudson, and a new Authenticator device registered. The app\'s change has no user and no IP in `initiatedBy`, which is why `actor` needs `coalesce()` and why filtering on the IP alone would miss it. offline_access lets the app keep reading mail after a password reset, so revoke the consent and the device too.',
      docs: [ENTRA, fn('json_extract_scalar'), fn('coalesce')],
    },
    {
      id: 'azure-entra-10', concept: 'azure-entra', type: 'write', difficulty: 5, title: 'What svc_backup touched, and what was reverted',
      task: 'svc_backup\'s credential was used from 192.0.2.60 against Azure. For every `resourceId` it touched from that address return `attacker_ops` (distinct operationName values) and `first_seen` (earliest `_time`), plus what d.schrute did to the same resource with successful operations (`resultType = "Success"`): `response_ops` (distinct operationName values) and `responded_at` (earliest `_time`). Keep resources nobody responded to. Return `resourceId`, `attacker_ops`, `first_seen`, `response_ops` and `responded_at`, oldest first_seen first.',
      solution: Q(`
        dataset = msft_azure_raw
        | filter caller = "svc_backup@acmelife.example" and callerIpAddress = "192.0.2.60"
        | comp values(operationName) as attacker_ops, min(_time) as first_seen by resourceId
        | join type = left (dataset = msft_azure_raw | filter caller = "d.schrute@acmelife.example" and resultType = "Success" | comp values(operationName) as response_ops, min(_time) as responded_at by resourceId) as r r.resourceId = resourceId
        | fields resourceId, attacker_ops, first_seen, response_ops, responded_at
        | sort asc first_seen`),
      hints: [
        'Stages: `filter` the attacker rows, `comp` by `resourceId`, `join type = left` to a sub-query that does the same for d.schrute, `fields`, and `sort` after the join (join does not keep order).',
        '`dataset = msft_azure_raw | filter caller = "svc_backup@acmelife.example" and callerIpAddress = "192.0.2.60" | comp values(operationName) as attacker_ops, min(_time) as first_seen by resourceId | join type = ___ (dataset = msft_azure_raw | filter ... | comp ... by resourceId) as r r.resourceId = resourceId | ...`',
        '`... | join type = left (dataset = msft_azure_raw | filter caller = "d.schrute@acmelife.example" and resultType = "Success" | comp values(operationName) as response_ops, min(_time) as responded_at by resourceId) as r r.resourceId = resourceId | fields resourceId, attacker_ops, first_seen, response_ops, responded_at | sort asc first_seen`',
      ],
      explanation: 'd.schrute reverted three of the four changes within three hours: the Owner role assignment for acme-policy-sync, the ALLOW-RDP-TEMP rule and the storage keys (regenerated after LISTKEYS). The RunCommand on VM-POLICYAPP-PROD-01 cannot be undone by a control-plane call, and the NSG flow logs show RDP from 192.0.2.60 and a 212 MB upload from that VM to 192.0.2.45, so it needs forensics. A left join keeps that unanswered row; an inner join would hide the one that matters.',
      docs: [EVENTHUB, st('join'), fn('values')],
    },

    // ===================================================================================
    // cross-source: alerts, GitHub EMU, Snowflake and the Cortex Data Model
    // ===================================================================================
    {
      id: 'cross-source-01', concept: 'cross-source', type: 'concept', difficulty: 2, title: 'Failed logins across every source',
      query: Q(`
        datamodel dataset = *
        | filter xdm.event.type = "AUTHENTICATION" and xdm.event.outcome = XDM_CONST.OUTCOME_FAILED
        | comp count() as failures, count_distinct(xdm.source.ipv4) as source_ips by _dataset
        | sort desc failures`),
      notes: [
        { line: 0, text: '`datamodel` reads the Cortex Data Model (XDM) view of the data instead of raw rows; `dataset = *` takes every dataset that has a mapping. Like `dataset`, it must be the first stage (after config).' },
        { line: 1, text: '`xdm.event.type` and `xdm.event.outcome` are normalised. `XDM_CONST.OUTCOME_FAILED` names the failed outcome, so one condition covers Entra error codes, GlobalProtect status, Snowflake IS_SUCCESS = "NO", AWS ConsoleLogin Failure and Windows 4625.' },
        { line: 2, text: '`_dataset` says which source each row came from, so it is the natural first grouping.' },
        { line: 3, text: 'Entra has the most failures (10), then Windows (7), GlobalProtect (5), Snowflake and the AWS console (3 each): 28 in all.' },
      ],
      prompt: 'Why compare with `XDM_CONST.OUTCOME_FAILED` instead of each source\'s own failure value?',
      choices: [
        'Each mapping translates its source\'s outcome (errorCode, status, IS_SUCCESS, event id) into the same xdm.event.outcome value, and the constant names that value without guessing its spelling',
        'The raw outcome fields are deleted once a dataset is mapped',
        '`XDM_CONST` makes the comparison case-sensitive',
        '`datamodel` queries only accept constants, never quoted strings',
      ],
      answer: 0,
      explanation: 'The data model is a normalisation layer: the mapping rules do the per-vendor translation once, so the hunt does not need to know that Snowflake writes "NO" or Entra writes 50126. The XDM_CONST values are the documented enum members for fields such as xdm.event.outcome.',
      docs: [XDM, XDM_AUTH],
    },
    {
      id: 'cross-source-02', concept: 'cross-source', type: 'mcq', difficulty: 2, title: 'Enum-backed alert fields',
      prompt: 'In the product, `alert_source` and `severity` in the `alerts` dataset are enum-backed: what is stored is an enum token, while the console shows a friendly label. A teammate types the label from the alert table into `filter alert_source = "..."` and gets no rows. Why do Acme Life\'s saved hunts use `contains` on the distinctive part (for example `alert_source contains "IOC"`), or list the stored values first with `comp count() as n by alert_source`?',
      choices: [
        '`=` needs the exact stored token, and the label in the UI (or the token spelling across product versions) can differ from it, so an exact match silently returns nothing',
        '`=` is always case-sensitive on enum fields and `contains` is not',
        'Enum fields are arrays, so `=` is a type error and `contains` searches the elements',
        '`contains` is faster because it uses the enum index',
      ],
      answer: 0,
      explanation: 'A filter compares the stored value, not what the console renders. When you cannot be sure of the token, look at the values first (here XDR_IOC, XDR_BIOC, XDR_ANALYTICS, XDR_AGENT, CORRELATION and SEV_030_MEDIUM rather than "Medium") or match the stable part with `contains`; an exact `=` on a guessed label fails quietly, with no error to warn you.',
      docs: [st('filter'), st('comp')],
    },
    {
      id: 'cross-source-03', concept: 'cross-source', type: 'predict', difficulty: 3, title: 'When did the IOC alerts happen?',
      query: Q(`
        config timeframe between "2026-10-23 00:00:00 UTC" and "2026-10-24 00:00:00 UTC"
        | dataset = alerts
        | comp count() as alerts by alert_source, severity`),
      prompt: 'The scanner 192.0.2.188 hit the ALB on 23 Oct, and `alerts` holds 8 XDR_IOC alerts for those connections (their `event_timestamp` is on 23 Oct). How many rows does this return?',
      choices: ['1: only the web shell alert', '2: the web shell alert and one row for the 8 IOC alerts', '9: one row per alert, the web shell alert and the 8 IOC alerts', '0: the 8 IOC alerts are the only alerts about 23 Oct, and they were raised on 24 Oct'],
      answer: 0,
      check: { kind: 'rowCount', value: 1 },
      explanation: 'The timeframe applies to `_time`, which for an alert is when it was raised. The IOC rule for 192.0.2.188 was added on 24 Oct and matched against stored flow logs, so all 8 alerts have `_time` 24 Oct 15:00:12 and only `event_timestamp` points back to 23 Oct. To find alerts about activity in a window, filter on `event_timestamp` inside a timeframe wide enough to include when they were raised.',
      docs: [st('config'), st('comp')],
    },
    {
      id: 'cross-source-04', concept: 'cross-source', type: 'predict', difficulty: 3, title: 'Password-only Snowflake logins',
      query: Q(`
        dataset = snowflake_snowflake_raw
        | filter FIRST_AUTHENTICATION_FACTOR = "PASSWORD" and SECOND_AUTHENTICATION_FACTOR = null
        | filter IS_SUCCESS = "YES"
        | comp count() as logins, values(REPORTED_CLIENT_TYPE) as clients by USER_NAME, CLIENT_IP`),
      prompt: 'How many rows does this return?',
      choices: ['1', '2: S.HUDSON and SVC_BACKUP', '0: IS_SUCCESS is a boolean, so the string "YES" never matches', 'An error: IS_SUCCESS has to be compared with true'],
      answer: 0,
      check: { kind: 'rowCount', value: 1 },
      explanation: 'Snowflake\'s LOGIN_HISTORY keeps its upper-case column names (and has no `_reporting_device_name` field) and uses strings for flags: IS_SUCCESS is "YES" or "NO", so comparing it with `true` is a type error. The two password-only successes from 192.0.2.199 (Snowflake UI, then JDBC) collapse into one S.HUDSON row: with no second factor, the reused password was enough. SVC_BACKUP also tried a password, from 192.0.2.60, but failed with 390144 (locked).',
      docs: [st('filter'), fn('values')],
    },
    {
      id: 'cross-source-05', concept: 'cross-source', type: 'bug', difficulty: 3, title: 'Grouping on an array field',
      prompt: 'Which addresses do the retroactive IOC alerts show as local_ip, and how late were they raised? The query fails. Click the broken line.',
      query: Q(`
        dataset = alerts
        | filter alert_source = "XDR_IOC"
        | alter delay_h = timestamp_diff(_time, event_timestamp, "HOUR")
        | comp count() as alerts, min(delay_h) as min_delay_h by local_ip
        | sort desc alerts`),
      bugLine: 3,
      expectError: true,
      fix: Q(`
        dataset = alerts
        | filter alert_source = "XDR_IOC"
        | alter delay_h = timestamp_diff(_time, event_timestamp, "HOUR"), local = to_string(local_ip)
        | comp count() as alerts, min(delay_h) as min_delay_h by local
        | sort desc alerts`),
      explanation: '`local_ip` is an array in the alerts dataset and comp cannot group on an array (the product fails the query): convert it with `to_string()` or `arrayexpand` it first. The ALB 10.240.34.41 is local_ip on 3 alerts because XSIAM maps a flow record\'s srcaddr to local_ip, so the reply records (ALB to scanner) put the ALB on the local side. It is the same scan, not the ALB attacking anyone, and every alert came 28 hours after its connection.',
      docs: [fn('to_string'), st('arrayexpand'), fn('timestamp_diff')],
    },
    {
      id: 'cross-source-06', concept: 'cross-source', type: 'parsons', difficulty: 3, title: 'GitHub organisation changes',
      task: 'GitHub EMU audit: list the organisation and repository changes (every action except git.clone, git.fetch and git.push) with the actor\'s country from `actor_location`, oldest first: `_time`, `actor`, `action`, `actor_ip`, `country`, `repo`, `application_name`, `visibility`.',
      solution: Q(`
        dataset = github_github_audit_raw
        | filter action not in ("git.clone", "git.fetch", "git.push")
        | alter country = actor_location -> country_code
        | fields _time, actor, action, actor_ip, country, repo, application_name, visibility
        | sort asc _time`),
      distractors: ['| filter actor_location = "NG"'],
      explanation: 'Three things to chase in nine rows, besides pam-beesly_AcmeLife\'s branch-protection override on finance-etl: jim-halpert_AcmeLife made sales-dashboards public at 04:15 on 23 Oct and internal again at 05:40 (about 85 minutes of exposure); dwight-schrute_AcmeLife granted the snowflakedb app (Snowflake\'s Git integration) credential access, which explains the later git.fetch and git.push from 203.0.113.31 with a GitHub App user-to-server token; and stanley-hudson_AcmeLife created a fine-grained PAT from 192.0.2.199 in Nigeria. `actor_location` is JSON, so comparing it with "NG" never matches; extract `country_code` in an alter.',
      docs: [st('filter'), fn('json_extract_scalar')],
    },
    {
      id: 'cross-source-07', concept: 'cross-source', type: 'cloze', difficulty: 4, title: 'Bytes to the C2 from every network source',
      task: 'One query across every network source: the number of flows and the total bytes sent to the C2 192.0.2.45 per dataset, largest first.',
      template: Q(`
        datamodel dataset = *
        | filter xdm.event.type = "___" and xdm.target.ipv4 = "192.0.2.45"
        | comp count() as flows, ___(xdm.source.sent_bytes) as bytes_out by _dataset
        | sort desc bytes_out`),
      answers: [['NETWORK'], ['sum']],
      solution: Q(`
        datamodel dataset = *
        | filter xdm.event.type = "NETWORK" and xdm.target.ipv4 = "192.0.2.45"
        | comp count() as flows, sum(xdm.source.sent_bytes) as bytes_out by _dataset
        | sort desc bytes_out`),
      explanation: 'The same C2 shows up in four places: 318 MB from 10.240.70.5 in AWS (VPC flow logs), 212 MB from the Azure VM (NSG flow logs), and the endpoint sessions seen twice, by the XDR agent and by the firewalls (which add s.hudson\'s 4.2 MB through the VPN tunnel). `xdm.source.sent_bytes` is always source to target, whatever the vendor called it. NETWORK keeps the threat logs out (same addresses, no byte counts), and do not add the totals up: xdr_data and the NGFW saw the same sessions.',
      docs: [XDM, XDM_NET, fn('sum_with_comp_stage', 'sum()')],
    },
    {
      id: 'cross-source-08', concept: 'cross-source', type: 'cloze', difficulty: 4, title: 'One user, every source',
      task: 'Every authentication by s.hudson across all mapped sources, with `_dataset` and the standard authentication columns, oldest first. The user name is written differently per source (s.hudson@acmelife.example, S.HUDSON@ACMELIFE.EXAMPLE, s.hudson).',
      template: Q(`
        datamodel dataset = *
        | filter xdm.event.type = "AUTHENTICATION" and ___(xdm.source.user.username) contains "s.hudson"
        | fields _dataset, ___
        | sort asc _time`),
      answers: [['lowercase'], ['fieldset.xdm_auth']],
      solution: Q(`
        datamodel dataset = *
        | filter xdm.event.type = "AUTHENTICATION" and lowercase(xdm.source.user.username) contains "s.hudson"
        | fields _dataset, fieldset.xdm_auth
        | sort asc _time`),
      explanation: '18 events tell the story in one table: the Windows logon on WS-FIN-042 and a normal MFA sign-in from the office, then from 192.0.2.199 four bad passwords and two MFA denials in Entra, two MFA denials in GlobalProtect, success in both, and Snowflake password failures then successes. `fieldset.xdm_auth` expands to the seven standard authentication columns, including `xdm.source.location.country`, which is derived from the source address, so every attempt from 192.0.2.199 shows NG whichever product logged it (the office sign-in shows AU; the Windows logon has no address). `lowercase()` keeps the match working under `config case_sensitive = true`, where Snowflake\'s upper-case name would drop out.',
      docs: [XDM, XDM_AUTH, fn('lowercase')],
    },
    {
      id: 'cross-source-09', concept: 'cross-source', type: 'write', difficulty: 4, title: 'Alerts in multi-alert incidents',
      task: 'Incident triage: list the alerts that belong to incidents with more than one alert. Return `incident_id`, `alerts_in_incident` (alerts in that incident), `sources` (number of distinct alert_source values in it), `alert_name`, `alert_source` and `severity`, ordered by incident_id and then by the alert\'s `_time`.',
      solution: Q(`
        dataset = alerts
        | join type = inner (dataset = alerts | comp count() as alerts_in_incident, count_distinct(alert_source) as sources by incident_id | filter alerts_in_incident > 1) as inc inc.incident_id = incident_id
        | fields incident_id, alerts_in_incident, sources, alert_name, alert_source, severity
        | sort asc incident_id, asc _time`),
      hints: [
        'Stages: `join` the alerts to a sub-query that runs `comp` by `incident_id` and keeps groups with more than one alert, then `fields` and `sort` (after the join).',
        '`dataset = alerts | join type = inner (dataset = alerts | comp count() as alerts_in_incident, ___(alert_source) as sources by incident_id | filter ___) as inc inc.incident_id = incident_id | fields ... | sort asc incident_id, asc _time`',
        '`dataset = alerts | join type = inner (dataset = alerts | comp count() as alerts_in_incident, count_distinct(alert_source) as sources by incident_id | filter alerts_in_incident > 1) as inc inc.incident_id = incident_id | fields incident_id, alerts_in_incident, sources, alert_name, alert_source, severity | sort asc incident_id, asc _time`',
      ],
      explanation: 'Three incidents group several alerts: 5101 is the WS-FIN-042 macro chain (four alerts from three engines), 5103 the PsExec move to WS-HR-017, and 5106 the AWS key abuse (two correlation rules). Counting in a sub-query and joining back keeps each alert\'s detail next to its incident\'s size; sort after the join, which does not keep order. The eight IOC alerts each opened their own incident (5200-5207), so they drop out here although they are one scan.',
      docs: [st('join'), st('comp'), fn('count_distinct')],
    },
    {
      id: 'cross-source-10', concept: 'cross-source', type: 'write', difficulty: 5, title: 'GitHub activity from outside Acme Life, joined to Entra',
      task: 'GitHub events whose `actor_ip` is not one of Acme Life\'s egress addresses (198.51.100.146, 198.51.100.147, 198.51.100.206): group by `actor`, `external_identity_username`, `actor_ip` and `programmatic_access_type` into `actions` (distinct actions), `repos` (distinct repos) and `first_seen` (earliest `_time`). Left-join successful Entra sign-ins (errorCode 0) for the same identity from the same address (`external_identity_username` = `userPrincipalName` and `actor_ip` = `ipAddress`) as `entra_successes` (count) and the first success time, and compute `minutes_after_signin` (minutes from that first success to first_seen). Return actor, actor_ip, programmatic_access_type, actions, repos, first_seen, entra_successes, minutes_after_signin, oldest first.',
      solution: Q(`
        dataset = github_github_audit_raw
        | filter actor_ip not in ("198.51.100.146", "198.51.100.147", "198.51.100.206")
        | comp values(action) as actions, count_distinct(repo) as repos, min(_time) as first_seen by actor, external_identity_username, actor_ip, programmatic_access_type
        | join type = left (dataset = msft_azure_ad_raw | alter error_code = to_integer(status -> errorCode) | filter error_code = 0 | comp count() as entra_successes, min(_time) as first_success by userPrincipalName, ipAddress) as e e.userPrincipalName = external_identity_username and e.ipAddress = actor_ip
        | alter minutes_after_signin = timestamp_diff(first_seen, first_success, "MINUTE")
        | fields actor, actor_ip, programmatic_access_type, actions, repos, first_seen, entra_successes, minutes_after_signin
        | sort asc first_seen`),
      hints: [
        'Stages: `filter` (not in), `comp` on the GitHub side, `join type = left` to an Entra sub-query (alter, filter, comp by userPrincipalName, ipAddress) with two conditions joined by `and`, `alter` with `timestamp_diff()`, `fields`, `sort`.',
        '`... | join type = left (dataset = msft_azure_ad_raw | alter error_code = to_integer(status -> errorCode) | filter error_code = 0 | comp count() as entra_successes, min(_time) as first_success by userPrincipalName, ipAddress) as e e.userPrincipalName = ___ and e.ipAddress = ___ | alter minutes_after_signin = timestamp_diff(___, ___, "MINUTE") | ...`',
        '`dataset = github_github_audit_raw | filter actor_ip not in ("198.51.100.146", "198.51.100.147", "198.51.100.206") | comp values(action) as actions, count_distinct(repo) as repos, min(_time) as first_seen by actor, external_identity_username, actor_ip, programmatic_access_type | join type = left (...) as e e.userPrincipalName = external_identity_username and e.ipAddress = actor_ip | alter minutes_after_signin = timestamp_diff(first_seen, first_success, "MINUTE") | fields ... | sort asc first_seen`',
      ],
      explanation: 'stanley-hudson_AcmeLife created a fine-grained PAT from 192.0.2.199 14 minutes after s.hudson\'s successful Entra sign-in from the same address, then cloned three repositories: code theft with the stolen identity, and a PAT survives a password reset. dwight-schrute_AcmeLife\'s activity from 203.0.113.31 has no matching sign-in because it is Snowflake\'s Git integration using a GitHub App user-to-server token after d.schrute\'s snowflakedb grant: expected, and the left join shows it instead of hiding it.',
      docs: [st('join'), fn('timestamp_diff'), fn('count_distinct')],
    },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : this);
