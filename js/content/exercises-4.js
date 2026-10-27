// XQL Tutor - exercise bank, part 4: the Acme Life tenant's perimeter and cloud sources (units network, aws, cloud-flows).
// Every query runs against js/data/datasets.js + js/data/datasets-tenant.js; check with `node test/validate-exercises.js`.
(function (root) {
  const XQL = (root.XQL = root.XQL || {});
  const REF = 'https://cortex-docs.paloaltonetworks.com/xql-command-reference-guide/readme';
  const st = (s, title) => ({ title: title || `${s} stage`, url: `${REF}/stages/${s}` });
  const fn = (f, title) => ({ title: title || `${f}()`, url: `${REF}/functions/${f}` });
  const SRC = 'https://cortex-docs.paloaltonetworks.com/cortex-xsiam/configure-cortex-xsiam/cortex-xsiam-data-sources';
  const D = {
    prisma: { title: 'Ingest data from Prisma Access', url: `${SRC}/palo-alto-networks-integrations/prisma-access/ingest-data-from-prisma-access` },
    ngfw: { title: 'Ingest data from Next-Generation Firewall', url: `${SRC}/palo-alto-networks-integrations/next-generation-firewall/ingest-data-from-next-generation-firewall` },
    cloudtrail: { title: 'Ingest audit logs from AWS CloudTrail', url: `${SRC}/vendor-specific-data-sources-and-connectors/amazon/amazon-s3/ingest-audit-logs-from-aws-cloudtrail` },
    vpcflow: { title: 'Ingest network flow logs from Amazon S3', url: `${SRC}/vendor-specific-data-sources-and-connectors/amazon/amazon-s3/ingest-network-flow-logs-from-amazon-s3` },
    nsg: { title: 'Ingest network flow logs from Azure Network Watcher', url: `${SRC}/vendor-specific-data-sources-and-connectors/microsoft/azure-network-watcher/ingest-network-flow-logs-from-microsoft-azure-network-watcher` },
    xdmNet: { title: 'XDM fields for network events', url: 'https://cortex-docs.paloaltonetworks.com/cortex-xsiam/reference-and-developer-docs/reference/xdm-fields-for-mapping-network-events' },
    xdm: { title: 'XSIAM Data Model schema', url: 'https://cortex-docs.paloaltonetworks.com/xsiam-data-model-schema/readme' },
  };
  // queries are written indented for readability; Q() strips the indentation (one stage per line)
  const Q = (s) => s.trim().split('\n').map((l) => l.trim()).join('\n');

  XQL.EXERCISES = (XQL.EXERCISES || []).concat([
    // ===================================================================================
    // network: NGFW traffic, threat and URL logs, GlobalProtect and Prisma Access
    // ===================================================================================
    {
      id: 'network-01', concept: 'network', type: 'concept', difficulty: 2, title: 'What the firewall did with the ALB scan',
      query: Q(`
        dataset = panw_ngfw_threat_raw
        | filter dest_ip = "10.240.34.41"
        | fields _time, source_ip, threat_name, severity, action, rule_matched
        | sort asc _time`),
      notes: [
        { line: 0, text: 'Firewall logs are split by log type. Threat logs hold signature matches (vulnerability, spyware, WildFire verdicts, URL); sessions are in panw_ngfw_traffic_raw, web requests in panw_ngfw_url_raw and VPN events in panw_ngfw_globalprotect_raw.' },
        { line: 1, text: 'The public ALB\'s private address in the AWS perimeter VPC. Four rows, all from the scanner 192.0.2.188 on 23 Oct.' },
        { line: 2, text: '`action` is what the firewall did: `alert` only logs, while `drop`, `reset-both` and `block-url` stop the traffic. `rule_matched` is the security rule that admitted the session (allow-inbound-web).' },
        { line: 3, text: 'Oldest first gives the order of the scan: SQL injection, directory traversal, Log4j, login brute force.' },
      ],
      prompt: 'Which of the four attempts did the firewall actually stop?',
      choices: ['Only the Log4j attempt (`reset-both`)', 'All four: a threat log row means the threat was blocked', 'None: threat logs only record, blocks show up in the traffic log', 'The two with severity high or critical'],
      answer: 0,
      explanation: 'A threat row records a signature match and `action` says what happened next: `alert` means the firewall logged it and let it through. Only the Log4j attempt was reset; the SQL injection, the directory traversal and the login brute force (severity high, still `alert`) reached the ALB, so their outcome has to be checked in the application logs.',
      docs: [D.ngfw, st('filter')],
      tags: ['tenant', 'threat'],
    },
    {
      id: 'network-02', concept: 'network', type: 'mcq', difficulty: 2, title: 'Where a home worker really connected from',
      prompt: 'j.halpert\'s Entra sign-in at 07:07 on 26 Oct comes from 198.51.100.206. Which field shows the public address his laptop actually connected from?',
      choices: ['`public_ip` in panw_ngfw_globalprotect_raw', '`source_ip` in panw_ngfw_traffic_raw', '`sourceIPAddress` in amazon_aws_raw: 198.51.100.206 is his home connection', 'None: 198.51.100.206 is not an Acme Life address, so treat the sign-in as an attacker'],
      answer: 0,
      explanation: '198.51.100.206 is the GlobalProtect / Prisma Access egress: cloud services see every home worker behind it, so it is an Acme Life address, not an attacker. Inside the tunnel the firewall logs the GlobalProtect address (10.100.5.21 in `source_ip`); only the GlobalProtect portal and gateway events keep the client\'s real address in `public_ip`, here 203.0.113.88 in AU.',
      docs: [D.prisma, D.ngfw],
      tags: ['tenant', 'globalprotect'],
    },
    {
      id: 'network-03', concept: 'network', type: 'predict', difficulty: 3, title: 'Detected is not stopped',
      query: Q(`
        dataset = panw_ngfw_threat_raw
        | filter source_ip = "192.0.2.188" and action != "alert"
        | fields _time, dest_ip, dest_port, threat_name, action`),
      prompt: 'The scanner 192.0.2.188 has five rows in the threat log. How many rows does this query return?',
      choices: ['0', '1', '2', '5'],
      answer: 2,
      check: { kind: 'rowCount', value: 2 },
      explanation: '`alert` is the one action that stops nothing, so `action != "alert"` keeps only the detections that were stopped: the Log4j attempt on the ALB (`reset-both`) and the RDP brute force against 203.0.113.10 (`drop`). The other three were let through; counting every threat row as a block overstates what the firewall prevented.',
      docs: [D.ngfw, st('filter')],
      tags: ['tenant', 'threat'],
    },
    {
      id: 'network-04', concept: 'network', type: 'predict', difficulty: 3, title: 'C2 sessions from the VPN zone',
      query: Q(`
        dataset = panw_ngfw_traffic_raw
        | filter dest_ip = "192.0.2.45" and from_zone = "vpn"
        | fields _time, source_ip, source_user, dest_port, app, bytes_sent, log_source_name, is_prisma_mobile`),
      prompt: 'Seven sessions in the traffic log reach the C2 192.0.2.45. Whose sessions does this query return?',
      choices: ['s.hudson\'s, from the tunnel address 10.100.5.88 through the AU Southeast gateway', 'j.halpert\'s, the other Prisma Access user that day', 'None: Prisma Access sessions are only in panw_ngfw_globalprotect_raw', 'All seven, because every user connects through the VPN'],
      answer: 0,
      check: { kind: 'values', column: 'source_user', value: ['s.hudson@acmelife.example'] },
      explanation: 'Prisma Access mobile-user sessions land in the same panw_ngfw_traffic_raw dataset as the on-prem firewall, marked with `from_zone = "vpn"`, `is_prisma_mobile = true` and the gateway as `log_source_name`. One of the seven C2 sessions came through the tunnel: s.hudson\'s account uploading 4,210,000 bytes at 20:14:15 on 26 Oct. A count that only looks at fw-syd-prod-01 misses it.',
      docs: [D.prisma, st('filter')],
      tags: ['tenant', 'prisma-access'],
    },
    {
      id: 'network-05', concept: 'network', type: 'bug', difficulty: 3, title: 'is_prisma_mobile is a boolean',
      prompt: 'This should total the Prisma Access mobile-user traffic per user. Click the broken line.',
      query: Q(`
        dataset = panw_ngfw_traffic_raw
        | filter is_prisma_mobile = "true"
        | comp count() as sessions, sum(bytes_sent) as sent by source_user
        | sort desc sent`),
      bugLine: 1,
      expectError: true,
      fix: Q(`
        dataset = panw_ngfw_traffic_raw
        | filter is_prisma_mobile = true
        | comp count() as sessions, sum(bytes_sent) as sent by source_user
        | sort desc sent`),
      explanation: '`is_prisma_mobile` is a boolean, and comparing it with the string "true" is a type error. Write the bare literal `true` (or `false` for the on-prem firewall); it is the field the vendor tells you to query to confirm Prisma Access data is arriving. s.hudson\'s account sent 5,120,200 bytes through the tunnel, j.halpert 70,300.',
      docs: [D.prisma, st('filter')],
      tags: ['tenant', 'prisma-access'],
    },
    {
      id: 'network-06', concept: 'network', type: 'parsons', difficulty: 3, title: 'Risky hosts seen only by SNI',
      task: 'Undecrypted TLS shows up in URL logs as `app = "ssl"` with `uri` equal to the host plus "/". List those SNI-only rows in medium- or high-risk categories with `_time`, `source_user`, `url_domain`, `url_category_list` and `is_prisma_mobile`, oldest first.',
      solution: Q(`
        dataset = panw_ngfw_url_raw
        | filter app = "ssl" and uri = concat(url_domain, "/")
        | filter url_category_list contains "high-risk" or url_category_list contains "medium-risk"
        | fields _time, source_user, url_domain, url_category_list, is_prisma_mobile
        | sort asc _time`),
      distractors: ['| filter http_method != null'],
      explanation: 'An SNI-only row proves a host was reached, not what was fetched: no path, method or user agent, one row per TLS session. Four come back: the AnyDesk relay, pastebin.com and the C2 twice (on-prem, then through Prisma Access). For pastebin and the C2 it is the separate `web-browsing` rows with a path (/raw/x8Kq2Lp, /update.exe) that show the payload; `http_method != null` keeps only decoded rows like those (plus the blocked a.hta), so next to `app = "ssl"` it returns nothing.',
      docs: [D.ngfw, fn('concat'), st('filter')],
      tags: ['tenant', 'url'],
    },
    {
      id: 'network-07', concept: 'network', type: 'cloze', difficulty: 3, title: 'Failed GlobalProtect logins',
      task: 'Count failed GlobalProtect authentications per user, country (`source_region`) and authentication method, with the public addresses and error messages, most failures first.',
      template: Q(`
        dataset = panw_ngfw_globalprotect_raw
        | filter status = ___
        | comp count() as failures, values(public_ip) as sources, values(error) as reasons by source_user, source_region, ___
        | sort desc failures, asc source_user`),
      answers: [['"failure"'], ['auth_method']],
      solution: Q(`
        dataset = panw_ngfw_globalprotect_raw
        | filter status = "failure"
        | comp count() as failures, values(public_ip) as sources, values(error) as reasons by source_user, source_region, auth_method
        | sort desc failures, asc source_user`),
      explanation: 'administrator (2) and svc_backup (1) failed from 192.0.2.60 in CN with LDAP, and s.hudson (2) from 192.0.2.199 in NG with SAML. s.hudson\'s reason is "MFA denied", so the password was already accepted, and the next attempt at 20:11:40 succeeded. LDAP on the portal is worth raising too: a password-only authentication profile sitting next to the SAML one.',
      docs: [D.prisma, st('comp'), fn('values')],
      tags: ['tenant', 'globalprotect'],
    },
    {
      id: 'network-08', concept: 'network', type: 'cloze', difficulty: 4, title: 'What the alerted C2 sessions moved',
      task: 'Command-and-control detections with `action = "alert"` were not stopped. Join them to the traffic log on source, destination and port to see how many bytes each session sent, largest first.',
      template: Q(`
        dataset = panw_ngfw_threat_raw
        | filter threat_category = "command-and-control" and action = ___
        | join type = inner (dataset = panw_ngfw_traffic_raw | fields source_ip as t_src, dest_ip as t_dst, dest_port as t_port, bytes_sent) as t t.t_src = source_ip and t.t_dst = dest_ip and t.t_port = ___
        | fields source_user, log_source_name, source_ip, dest_port, threat_name, bytes_sent
        | sort desc bytes_sent`),
      answers: [['"alert"'], ['dest_port']],
      solution: Q(`
        dataset = panw_ngfw_threat_raw
        | filter threat_category = "command-and-control" and action = "alert"
        | join type = inner (dataset = panw_ngfw_traffic_raw | fields source_ip as t_src, dest_ip as t_dst, dest_port as t_port, bytes_sent) as t t.t_src = source_ip and t.t_dst = dest_ip and t.t_port = dest_port
        | fields source_user, log_source_name, source_ip, dest_port, threat_name, bytes_sent
        | sort desc bytes_sent`),
      explanation: 'All five C2 detections were `alert`, and the traffic log shows what got through: 52,428,800 bytes from s.hudson\'s workstation to port 4444, 4,210,000 bytes from his account\'s Prisma Access tunnel, 307,200 bytes on 443 from the same workstation, then SRV-WEB-02\'s script download (10.10.2.8) and a.martin\'s Mac. Renaming the sub-query fields avoids name conflicts, and the sort comes after the join because join does not keep order.',
      docs: [st('join'), D.ngfw],
      tags: ['tenant', 'threat', 'join'],
    },
    {
      id: 'network-09', concept: 'network', type: 'write', difficulty: 4, title: 'Signatures that reached the ALB',
      task: 'Which threat signatures against the ALB (10.240.34.41) were only alerted, not stopped? Return `threat_name`, `threat_category`, `severity`, `attempts` (count), `first_seen` (earliest `_time`) and `payloads` (distinct `misc` values), oldest first.',
      solution: Q(`
        dataset = panw_ngfw_threat_raw
        | filter dest_ip = "10.240.34.41" and action = "alert"
        | comp count() as attempts, min(_time) as first_seen, values(misc) as payloads by threat_name, threat_category, severity
        | sort asc first_seen`),
      hints: [
        'Stages: `filter` on the ALB address and `action = "alert"`, `comp` with `count()`, `min(_time)` and `values(misc)` by the three signature fields, then `sort`.',
        '`dataset = panw_ngfw_threat_raw | filter dest_ip = "10.240.34.41" and action = ___ | comp count() as attempts, ___(_time) as first_seen, values(misc) as payloads by threat_name, threat_category, severity | sort asc first_seen`',
        '`... | filter dest_ip = "10.240.34.41" and action = "alert" | comp count() as attempts, min(_time) as first_seen, values(misc) as payloads by threat_name, threat_category, severity | sort asc first_seen`',
      ],
      explanation: 'Three signatures got through the allow-inbound-web rule: the SQL injection on /api/policies, the directory traversal to /etc/passwd and the brute force on /api/login. Only the Log4j attempt was reset. Those three are what to check in the ALB and application logs, and the case for a vulnerability profile on that rule that blocks rather than alerts.',
      docs: [D.ngfw, st('comp'), fn('values')],
      tags: ['tenant', 'threat'],
    },
    {
      id: 'network-10', concept: 'network', type: 'write', difficulty: 5, title: 'Who came in through Prisma Access',
      task: 'Who connected through Prisma Access and what did they reach? Join the Prisma Access sessions in `panw_ngfw_traffic_raw` to the GlobalProtect `gateway-connected` events on the tunnel address (`private_ip` = `source_ip`) and the user, and return `_time`, `source_user`, `public_ip`, `source_region`, `dest_ip`, `dest_port`, `app`, `action` and `bytes_sent`, oldest first.',
      solution: Q(`
        dataset = panw_ngfw_traffic_raw
        | filter is_prisma_mobile = true
        | join conflict_strategy = left type = inner (dataset = panw_ngfw_globalprotect_raw | filter event_id = "gateway-connected" | fields source_user as gp_user, private_ip, public_ip, source_region) as gp gp.private_ip = source_ip and gp.gp_user = source_user
        | fields _time, source_user, public_ip, source_region, dest_ip, dest_port, app, action, bytes_sent
        | sort asc _time`),
      hints: [
        'Stages: `filter is_prisma_mobile = true`, `join` to a GlobalProtect sub-query that keeps the `gateway-connected` rows (rename its `source_user`), `fields`, then `sort` after the join.',
        '`dataset = panw_ngfw_traffic_raw | filter is_prisma_mobile = true | join conflict_strategy = left type = inner (dataset = panw_ngfw_globalprotect_raw | filter event_id = "gateway-connected" | fields source_user as gp_user, private_ip, public_ip, source_region) as gp gp.___ = source_ip and gp.gp_user = ___ | fields ... | sort asc _time`',
        '`... as gp gp.private_ip = source_ip and gp.gp_user = source_user | fields _time, source_user, public_ip, source_region, dest_ip, dest_port, app, action, bytes_sent | sort asc _time`',
      ],
      explanation: 'The traffic log only knows the tunnel address; GlobalProtect ties it to the client\'s public address. j.halpert came from 203.0.113.88 in AU and used SMB to the DC and Outlook; s.hudson\'s account came from 192.0.2.199 in NG, was denied RDP to the DC, moved 910,200 bytes over SMB and uploaded 4,210,000 bytes to the C2. Matching the user as well as the address guards against reused tunnel addresses, and since `fields` never drops system fields, `conflict_strategy = left` keeps the session `_time` rather than the connect time.',
      docs: [D.prisma, st('join')],
      tags: ['tenant', 'prisma-access', 'join'],
    },

    // ===================================================================================
    // aws: CloudTrail in amazon_aws_raw
    // ===================================================================================
    {
      id: 'aws-01', concept: 'aws', type: 'concept', difficulty: 2, title: 'Reading a CloudTrail record',
      query: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "cloudtrail"
        | filter eventSource = "iam.amazonaws.com"
        | alter identity_type = userIdentity -> type, user_name = userIdentity -> userName, sso_role = userIdentity -> sessionContext.sessionIssuer.userName
        | fields _time, eventName, identity_type, user_name, sso_role, sourceIPAddress, awsRegion, errorCode
        | sort asc _time`),
      notes: [
        { line: 0, text: 'Everything the Amazon S3 collector brings in: CloudTrail events and VPC flow records share this dataset.' },
        { line: 1, text: 'Keep CloudTrail only. Flow records have no eventName or userIdentity, so this filter comes first and makes every later stage cheaper.' },
        { line: 2, text: '`eventSource` is the AWS service and `eventName` the API call (CreateAccessKey, AttachUserPolicy, DeleteUser, ...).' },
        { line: 3, text: '`userIdentity` is a JSON string. `->` is shorthand for `json_extract_scalar()` and nested keys are separated by dots. IAM users have a top-level `userName`; SSO and other assumed roles keep the role under `sessionContext.sessionIssuer.userName`.' },
        { line: 4, text: '`errorCode` stays null when the call succeeded.' },
        { line: 5, text: 'Oldest first: the AFT pipeline on 22 Oct, the attack from 192.0.2.77, then the CyberOps response.' },
      ],
      prompt: 'On the CyberOps rows (UpdateAccessKey, DetachUserPolicy, DeleteUser) `user_name` is null but `sso_role` is set. Why?',
      choices: ['They are AssumedRole identities: an SSO session has no top-level userName, the role name sits in sessionContext.sessionIssuer.userName', 'The `->` shorthand cannot read nested JSON, so it returns null on long records', 'CloudTrail leaves the user name out for calls from the office egress 198.51.100.147', 'The calls failed, and failed calls are logged without the user'],
      answer: 0,
      explanation: 'CloudTrail shapes `userIdentity` by `type`: an IAMUser (svc-deploy) has `userName`, Root has neither a user name nor a session issuer, and an AssumedRole (SSO permission sets such as AWSReservedSSO_CyberOps_..., the AFT pipeline) carries the role in `sessionContext.sessionIssuer.userName`. Read `type` first and you know which path to use.',
      docs: [D.cloudtrail, fn('json_extract_scalar')],
      tags: ['tenant', 'cloudtrail'],
    },
    {
      id: 'aws-02', concept: 'aws', type: 'predict', difficulty: 2, title: 'Which calls failed?',
      query: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "cloudtrail" and errorCode != null
        | fields _time, eventName, sourceIPAddress, awsRegion, errorCode`),
      prompt: 'How many rows does this return?',
      choices: ['0', '1', '3', '4'],
      answer: 1,
      check: { kind: 'rowCount', value: 1 },
      explanation: '`errorCode` is set only when an API call failed: the attacker\'s StopLogging on acme-org-trail, refused by an explicit deny in a service control policy (AccessDenied). Failed calls are still logged, so the attempt to blind CloudTrail is itself evidence. The three failed root console logins do not count: ConsoleLogin reports failure in `responseElements -> ConsoleLogin` and `errorMessage`, and leaves `errorCode` null.',
      docs: [D.cloudtrail, st('filter')],
      tags: ['tenant', 'cloudtrail'],
    },
    {
      id: 'aws-03', concept: 'aws', type: 'predict', difficulty: 3, title: 'The attacker in Sydney',
      query: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "cloudtrail" and sourceIPAddress = "192.0.2.77"
        | comp count() as calls by awsRegion
        | sort desc calls`),
      prompt: 'The stolen key and the root password were used from 192.0.2.77 in Germany. How many of its calls landed in ap-southeast-2, Acme Life\'s own region?',
      choices: ['0', '4', '10', '19'],
      answer: 1,
      check: { kind: 'values', column: 'calls', value: [10, 5, 4], ordered: true },
      explanation: '`awsRegion` is the region of the endpoint that was called, not where the caller sits. StopLogging on the Sydney trail, PutBucketPolicy and the two GetObject calls on the prod exports bucket all ran in ap-southeast-2, so a hunt that only looks outside Acme Life\'s region misses the data theft. The five us-east-1 calls are the root console sign-ins and DeleteAccessKey.',
      docs: [D.cloudtrail, st('comp')],
      tags: ['tenant', 'cloudtrail'],
    },
    {
      id: 'aws-04', concept: 'aws', type: 'bug', difficulty: 3, title: 'Port 22 open to the world',
      prompt: 'This should find security group rules that opened SSH (port 22) to 0.0.0.0/0. Click the broken line.',
      query: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "cloudtrail" and eventName = "AuthorizeSecurityGroupIngress"
        | alter from_port = json_extract_scalar(requestParameters, "$.ipPermissions.items[0].fromPort"), cidr = json_extract_scalar(requestParameters, "$.ipPermissions.items[0].ipRanges.items[0].cidrIp")
        | filter from_port = 22 and cidr = "0.0.0.0/0"
        | fields _time, sourceIPAddress, awsRegion, from_port, cidr`),
      bugLine: 3,
      expectError: true,
      fix: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "cloudtrail" and eventName = "AuthorizeSecurityGroupIngress"
        | alter from_port = json_extract_scalar(requestParameters, "$.ipPermissions.items[0].fromPort"), cidr = json_extract_scalar(requestParameters, "$.ipPermissions.items[0].ipRanges.items[0].cidrIp")
        | filter to_integer(from_port) = 22 and cidr = "0.0.0.0/0"
        | fields _time, sourceIPAddress, awsRegion, from_port, cidr`),
      explanation: '`json_extract_scalar()` always returns text, even for a JSON number such as `fromPort`, so comparing it with the number 22 is a type error. Convert with `to_integer()` (or compare with "22"). The rule was added by svc-deploy from 192.0.2.77 at 09:31:02 in eu-central-1, a minute after it launched four p3.8xlarge instances.',
      docs: [fn('json_extract_scalar'), fn('to_integer')],
      tags: ['tenant', 'cloudtrail'],
    },
    {
      id: 'aws-05', concept: 'aws', type: 'parsons', difficulty: 3, title: 'Root console sign-ins',
      task: 'List every root console sign-in with `_time`, `sourceIPAddress`, `awsRegion`, `result` (from `responseElements`) and `mfa_used` (from `additionalEventData`), oldest first.',
      solution: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "cloudtrail" and eventName = "ConsoleLogin"
        | alter identity_type = userIdentity -> type, result = responseElements -> ConsoleLogin, mfa_used = additionalEventData -> MFAUsed
        | filter identity_type = "Root"
        | fields _time, sourceIPAddress, awsRegion, result, mfa_used
        | sort asc _time`),
      distractors: ['| filter errorCode != null'],
      explanation: 'Root signed in from 192.0.2.77 at 09:43:05 after three failures, and every attempt says `MFAUsed` "No": the root user has no MFA, which is the finding. The failures are in `responseElements -> ConsoleLogin` ("Failure"), not in `errorCode`, so the distractor would return nothing. `MFAUsed` is the string "Yes" or "No", not a boolean.',
      docs: [D.cloudtrail, fn('json_extract_scalar')],
      tags: ['tenant', 'cloudtrail'],
    },
    {
      id: 'aws-06', concept: 'aws', type: 'cloze', difficulty: 3, title: 'Who made the bucket public?',
      task: 'Find bucket policy changes and who made them. Pull the bucket name and the first statement\'s Principal out of `requestParameters` (JSON keys are case-sensitive).',
      template: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "cloudtrail" and eventName in ("PutBucketPolicy", "DeleteBucketPolicy")
        | alter bucket = requestParameters -> ___, principal = json_extract_scalar(requestParameters, "$.bucketPolicy.Statement[0].___"), caller = coalesce(userIdentity -> userName, userIdentity -> sessionContext.sessionIssuer.userName)
        | fields _time, eventName, bucket, principal, caller, sourceIPAddress
        | sort asc _time`),
      answers: [['bucketName'], ['Principal']],
      solution: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "cloudtrail" and eventName in ("PutBucketPolicy", "DeleteBucketPolicy")
        | alter bucket = requestParameters -> bucketName, principal = json_extract_scalar(requestParameters, "$.bucketPolicy.Statement[0].Principal"), caller = coalesce(userIdentity -> userName, userIdentity -> sessionContext.sessionIssuer.userName)
        | fields _time, eventName, bucket, principal, caller, sourceIPAddress
        | sort asc _time`),
      explanation: 'svc-deploy put a policy on acme-policyadmin-prod-exports with Principal "*" (anyone may s3:GetObject) at 09:25:12 and pulled two customer exports a minute later; the CyberOps role deleted the policy at 10:19:00. JSON keys are case-sensitive, so `principal` or `bucketname` would quietly return null instead of failing. `Statement[0]` picks the first statement of the policy array.',
      docs: [fn('json_extract_scalar'), fn('coalesce'), D.cloudtrail],
      tags: ['tenant', 'cloudtrail'],
    },
    {
      id: 'aws-07', concept: 'aws', type: 'cloze', difficulty: 4, title: 'What CyberOps changed',
      task: 'List the changes (not the read-only calls) made through the CyberOps SSO permission set, with the user or bucket each one touched, oldest first.',
      template: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "cloudtrail" and readOnly = ___
        | alter sso_role = userIdentity -> sessionContext.___.userName, target = coalesce(requestParameters -> userName, requestParameters -> bucketName)
        | filter sso_role = "AWSReservedSSO_CyberOps_*"
        | fields _time, eventName, target, sso_role, sourceIPAddress, awsRegion
        | sort asc _time`),
      answers: [['false'], ['sessionIssuer']],
      solution: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "cloudtrail" and readOnly = false
        | alter sso_role = userIdentity -> sessionContext.sessionIssuer.userName, target = coalesce(requestParameters -> userName, requestParameters -> bucketName)
        | filter sso_role = "AWSReservedSSO_CyberOps_*"
        | fields _time, eventName, target, sso_role, sourceIPAddress, awsRegion
        | sort asc _time`),
      explanation: 'IAM Identity Center permission sets appear as roles named AWSReservedSSO_<permission set>_<suffix>, hence the wildcard. Five changes ran from the office egress 198.51.100.147 between 10:15 and 10:19: the new key set Inactive, AdministratorAccess detached, backup-admin deleted, the four GPU instances terminated (in eu-central-1, where they ran) and the public bucket policy removed. `readOnly = false` drops the role\'s earlier Describe and LookupEvents calls.',
      docs: [D.cloudtrail, fn('coalesce'), st('filter')],
      tags: ['tenant', 'cloudtrail'],
    },
    {
      id: 'aws-08', concept: 'aws', type: 'write', difficulty: 4, title: 'Everything the stolen key did',
      task: 'List every API call made with svc-deploy\'s access key AKIAEXAMPLE5TJ3Q9LD (`accessKeyId` inside `userIdentity`): `_time`, `eventSource`, `eventName`, `awsRegion` and `errorCode`, oldest first.',
      solution: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "cloudtrail"
        | alter access_key = userIdentity -> accessKeyId
        | filter access_key = "AKIAEXAMPLE5TJ3Q9LD"
        | fields _time, eventSource, eventName, awsRegion, errorCode
        | sort asc _time`),
      hints: [
        'Stages: `filter` on `_log_type`, `alter` the key out of `userIdentity`, `filter` on it, `fields`, `sort asc _time`.',
        '`dataset = amazon_aws_raw | filter _log_type = "cloudtrail" | alter access_key = userIdentity -> ___ | filter access_key = "AKIAEXAMPLE5TJ3Q9LD" | fields _time, eventSource, eventName, awsRegion, errorCode | sort asc _time`',
        '`... | alter access_key = userIdentity -> accessKeyId | filter access_key = "AKIAEXAMPLE5TJ3Q9LD" | fields _time, eventSource, eventName, awsRegion, errorCode | sort asc _time`',
      ],
      explanation: 'Fourteen calls in eleven minutes: reconnaissance (GetCallerIdentity, ListUsers, ListAttachedUserPolicies), persistence and escalation (CreateAccessKey, AttachUserPolicy, CreateUser, CreateLoginProfile), a StopLogging that failed with AccessDenied (the only row with an `errorCode`), then the bucket policy, two customer exports, four GPU instances and SSH from anywhere. Keying on the access key rather than the source IP would also catch the key used from another address; the new key AKIAEXAMPLE9ZZNEW01 never made a call before CyberOps disabled it.',
      docs: [D.cloudtrail, fn('json_extract_scalar')],
      tags: ['tenant', 'cloudtrail'],
    },
    {
      id: 'aws-09', concept: 'aws', type: 'write', difficulty: 4, title: 'Calls outside Sydney',
      task: 'Acme Life runs in ap-southeast-2. For CloudTrail calls in any other region, return `recipientAccountId`, `identity_type` (`userIdentity -> type`), `awsRegion`, `calls` (count) and `events` (distinct `eventName` values), most calls first and then by account id.',
      solution: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "cloudtrail" and awsRegion != "ap-southeast-2"
        | alter identity_type = userIdentity -> type
        | comp count() as calls, values(eventName) as events by recipientAccountId, identity_type, awsRegion
        | sort desc calls, asc recipientAccountId`),
      hints: [
        'Stages: `filter` on `_log_type` and `awsRegion`, `alter` the identity type, `comp count()` and `values()` by account, type and region, `sort` on two keys.',
        '`dataset = amazon_aws_raw | filter _log_type = "cloudtrail" and awsRegion != ___ | alter identity_type = userIdentity -> type | comp count() as calls, values(eventName) as events by ___, identity_type, awsRegion | sort desc calls, asc recipientAccountId`',
        '`... | filter _log_type = "cloudtrail" and awsRegion != "ap-southeast-2" | alter identity_type = userIdentity -> type | comp count() as calls, values(eventName) as events by recipientAccountId, identity_type, awsRegion | sort desc calls, asc recipientAccountId`',
      ],
      explanation: 'Two groups are the attack, both in acme-m1-policyadmin-prod-01 (111122223333): an IAMUser with 10 calls in eu-central-1 and Root with 5 in us-east-1. The two AssumedRole rows are expected: CyberOps terminating the attacker\'s instances where they ran, and j.halpert\'s SSO console sign-in to acme-m2-datalake-nonprod-01 from the office egress 198.51.100.146 (console sign-ins are recorded in us-east-1). Acme Life works through SSO roles, so an IAM user key used from aws-cli outside the home region is the odd one out; the attacker\'s four ap-southeast-2 calls are not in this list.',
      docs: [D.cloudtrail, st('comp'), fn('values')],
      tags: ['tenant', 'cloudtrail'],
    },
    {
      id: 'aws-10', concept: 'aws', type: 'write', difficulty: 5, title: 'The IAM escalation chain and the clean-up',
      task: 'Rebuild the IAM user changes of 26 Oct, attack and response. For IAM calls CreateAccessKey, AttachUserPolicy, CreateUser, CreateLoginProfile, DeleteAccessKey, UpdateAccessKey, DetachUserPolicy and DeleteUser, return `_time`, `eventName`, `actor` (the IAM user name, else the SSO role from `sessionContext.sessionIssuer.userName`, else the identity `type`), `target_user` and `policy` (`userName` and `policyArn` from `requestParameters`), `new_key` (`accessKey.accessKeyId` from `responseElements`) and `sourceIPAddress`, oldest first.',
      solution: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "cloudtrail" and eventSource = "iam.amazonaws.com" and eventName in ("CreateAccessKey", "AttachUserPolicy", "CreateUser", "CreateLoginProfile", "DeleteAccessKey", "UpdateAccessKey", "DetachUserPolicy", "DeleteUser")
        | alter actor = coalesce(userIdentity -> userName, userIdentity -> sessionContext.sessionIssuer.userName, userIdentity -> type), target_user = requestParameters -> userName, policy = requestParameters -> policyArn, new_key = responseElements -> accessKey.accessKeyId
        | fields _time, eventName, actor, target_user, policy, new_key, sourceIPAddress
        | sort asc _time`),
      hints: [
        'Stages: `filter` with `in (...)` on `eventName`, one `alter` with `coalesce()` over the three identity paths and three more `->` extractions, `fields`, `sort asc _time`.',
        '`dataset = amazon_aws_raw | filter _log_type = "cloudtrail" and eventSource = "iam.amazonaws.com" and eventName in (...) | alter actor = coalesce(userIdentity -> userName, userIdentity -> ___, userIdentity -> type), target_user = requestParameters -> userName, policy = requestParameters -> policyArn, new_key = responseElements -> ___ | fields ... | sort asc _time`',
        '`... | alter actor = coalesce(userIdentity -> userName, userIdentity -> sessionContext.sessionIssuer.userName, userIdentity -> type), target_user = requestParameters -> userName, policy = requestParameters -> policyArn, new_key = responseElements -> accessKey.accessKeyId | fields _time, eventName, actor, target_user, policy, new_key, sourceIPAddress | sort asc _time`',
      ],
      explanation: 'svc-deploy minted itself a second key (AKIAEXAMPLE9ZZNEW01), attached AdministratorAccess to itself, created backup-admin and gave it a console password: four calls in 75 seconds from 192.0.2.77. Root, signed in from the same address, then deleted svc-deploy\'s original key, and the CyberOps role disabled the new key, detached the policy and deleted backup-admin. `coalesce()` over the three identity paths gives one actor column for IAM users, SSO roles and root.',
      docs: [D.cloudtrail, fn('coalesce'), fn('json_extract_scalar')],
      tags: ['tenant', 'cloudtrail'],
    },

    // ===================================================================================
    // cloud-flows: VPC flow logs, Azure NSG flow logs, the network_story mirror, the data model
    // ===================================================================================
    {
      id: 'cloud-flows-01', concept: 'cloud-flows', type: 'concept', difficulty: 2, title: 'Two records per connection',
      query: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "flowlogs"
        | filter srcaddr = "192.0.2.188" or dstaddr = "192.0.2.188"
        | fields _time, interface_id, srcaddr, srcport, dstaddr, dstport, action, flow_direction, bytes
        | sort asc _time`),
      notes: [
        { line: 0, text: 'The same dataset that holds CloudTrail.' },
        { line: 1, text: 'VPC flow records only: source and destination address and port, `action` ACCEPT or REJECT, the ENI that captured the record (`interface_id`) and `flow_direction` (ingress or egress relative to that ENI).' },
        { line: 2, text: 'Every record that involves the scanner, in either direction: 14 rows.' },
        { line: 3, text: 'Show the 5-tuple, the decision and the direction side by side.' },
        { line: 4, text: 'In time order the accepted records come in pairs with the same timestamp: the scanner to the ALB on 443 (ingress), then the ALB back to the scanner\'s ephemeral port (egress). The REJECTs on 22 and 3389 have no partner.' },
      ],
      prompt: 'What is the record `10.240.34.41:443 -> 192.0.2.188:51514`, egress, ACCEPT, at 10:40:02?',
      choices: ['The ALB\'s reply inside the scanner\'s connection: the same 5-tuple reversed, logged at the same time', 'The ALB opening its own connection out to the scanner', 'A second connection from the scanner, logged from the ALB\'s side', 'Proof that the ALB is compromised and calling home'],
      answer: 0,
      explanation: 'VPC flow logs record each direction of a connection separately, so one TCP session gives a request record (client to the service port) and a reply record (service port back to the client\'s ephemeral port). Source port 443 and destination port 51514 give the reply away: servers answer from their service port. Reading reply records as "the ALB connected out to the attacker" is the classic flow-log misread.',
      docs: [D.vpcflow, st('filter')],
      tags: ['tenant', 'vpc-flow'],
    },
    {
      id: 'cloud-flows-02', concept: 'cloud-flows', type: 'predict', difficulty: 3, title: 'Did the ALB talk to the scanner?',
      query: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "flowlogs" and srcaddr = "10.240.34.41" and dstaddr = "192.0.2.188"
        | fields _time, srcport, dstport, action, flow_direction, bytes`),
      prompt: 'How many rows come back, and what are they?',
      choices: ['0: the ALB never initiates traffic to the internet', '6: the ALB connected out to the scanner six times', '6: the ALB\'s replies in the scanner\'s six connections', '8: six replies plus the two REJECTs'],
      answer: 2,
      check: { kind: 'rowCount', value: 6 },
      explanation: 'Every row has srcport 443, an ephemeral dstport (51514 to 51688) and the same timestamp as one of the scanner\'s requests: they are replies, not outbound connections. The REJECTed probes on 22 and 3389 got no reply, so there are six, not eight. The same mapping (srcaddr becomes the local address) is why the retroactive IOC alerts sometimes list the ALB as `local_ip`.',
      docs: [D.vpcflow],
      tags: ['tenant', 'vpc-flow'],
    },
    {
      id: 'cloud-flows-03', concept: 'cloud-flows', type: 'predict', difficulty: 3, title: 'The endpoint that is not an endpoint',
      query: Q(`
        preset = network_story
        | filter action_remote_ip = "192.0.2.188"
        | comp count() as conns by agent_hostname, agent_id`),
      prompt: 'Which endpoint does this say talked to the scanner 192.0.2.188?',
      choices: ['No endpoint: these are stitched VPC flow records, with agent_hostname null and the ALB\'s ENI as agent_id', 'SRV-WEB-02, the public web server', 'Four different endpoints, one connection each', 'None, and no rows come back: xdr_data holds only agent telemetry'],
      answer: 0,
      check: { kind: 'cell', row: 0, column: 'agent_id', value: 'eni-0f1e2d3c4b5a6978' },
      explanation: 'With Enhanced Cloud Protection, flow logs are stitched into xdr_data as network stories (`preset = network_story`): the rows have `agent_hostname` null, the ENI (here the ALB\'s eni-0f1e2d3c4b5a6978) in `agent_id` and the ALB as `action_local_ip`. No XDR agent saw this traffic, so filter `agent_hostname != null` before claiming that an endpoint contacted something.',
      docs: [D.vpcflow, st('presets', 'preset stage')],
      tags: ['tenant', 'network-story'],
    },
    {
      id: 'cloud-flows-04', concept: 'cloud-flows', type: 'bug', difficulty: 3, title: 'Deduplicating on the wrong key',
      prompt: 'Some NSG flow records are delivered twice. This should count each flow once per rule and decision. Click the broken line.',
      query: Q(`
        dataset = msft_azure_flowlogs_raw
        | dedup sourceAddress, destinationAddress, sourcePort, destinationPort, startTime, _insert_time
        | comp count() as flows, sum(bytesSent) as bytes_sent by nsgRuleName, deviceAction
        | sort desc flows, asc nsgRuleName`),
      bugLine: 1,
      expectError: false,
      fix: Q(`
        dataset = msft_azure_flowlogs_raw
        | dedup sourceAddress, destinationAddress, sourcePort, destinationPort, startTime
        | comp count() as flows, sum(bytesSent) as bytes_sent by nsgRuleName, deviceAction
        | sort desc flows, asc nsgRuleName`),
      explanation: 'A duplicate delivery has the same 5-tuple and `startTime` but a later `_insert_time` (when XSIAM stored it), so putting `_insert_time` in the dedup key keeps every copy. Dedup on the flow identity only: 13 records become 9 flows, and ALLOW-RDP-TEMP drops from 4 to 2.',
      docs: [st('dedup'), D.nsg],
      tags: ['tenant', 'nsg-flow'],
    },
    {
      id: 'cloud-flows-05', concept: 'cloud-flows', type: 'parsons', difficulty: 3, title: 'Uploads, not replies',
      task: 'Find the largest uploads from AWS to the internet without counting reply records: egress records to addresses outside 10.0.0.0/8 whose destination port is lower than the source port (the client side uses the high, ephemeral port). Return `interface_id`, `srcaddr`, `dstaddr`, `dstport` and `bytes`, largest first.',
      solution: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "flowlogs" and flow_direction = "egress"
        | filter not incidr(dstaddr, "10.0.0.0/8") and dstport < srcport
        | fields interface_id, srcaddr, dstaddr, dstport, bytes
        | sort desc bytes`),
      distractors: ['| filter dstport > srcport'],
      explanation: 'Without the port test the ALB\'s replies (to the scanner, and 402,100 bytes to the office egress 198.51.100.146) would look like uploads. What remains is the app server\'s 1,200-byte call to 13.224.1.7 and 318,000,000 bytes from 10.240.70.5 (eni-0bad1dea5c0ffee99) to the C2 192.0.2.45 at 09:33:40 on 26 Oct, minutes after the stolen key pulled the customer exports. Lower-port-is-the-server is a heuristic; confirm with the paired ingress record.',
      docs: [D.vpcflow, fn('incidr')],
      tags: ['tenant', 'vpc-flow'],
    },
    {
      id: 'cloud-flows-06', concept: 'cloud-flows', type: 'cloze', difficulty: 3, title: 'Rejected probes',
      task: 'Which ports were rejected, on which interface, and from where? Count the REJECT records per ENI and destination port.',
      template: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "flowlogs" and action = ___
        | comp count() as attempts, values(srcaddr) as sources by interface_id, ___
        | sort asc dstport`),
      answers: [['"REJECT"', '"reject"'], ['dstport']],
      solution: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "flowlogs" and action = "REJECT"
        | comp count() as attempts, values(srcaddr) as sources by interface_id, dstport
        | sort asc dstport`),
      explanation: 'Two probes from the scanner were rejected on the ALB\'s ENI: SSH (22) and RDP (3389); the ALB only accepts 443. A rejected flow has no reply record, so each attempt is counted once here; the request/reply doubling only affects ACCEPTed traffic.',
      docs: [D.vpcflow, st('comp')],
      tags: ['tenant', 'vpc-flow'],
    },
    {
      id: 'cloud-flows-07', concept: 'cloud-flows', type: 'cloze', difficulty: 4, title: 'Endpoints only',
      task: 'Which endpoints sent the most data to external addresses (`action_country` set)? Use the network story preset, but leave out the stitched VPC flow rows, which have no agent hostname.',
      template: Q(`
        preset = ___
        | filter agent_hostname ___ null and action_country != null
        | comp count() as conns, sum(action_total_upload) as upload_bytes by agent_hostname
        | sort desc upload_bytes`),
      answers: [['network_story'], ['!=']],
      solution: Q(`
        preset = network_story
        | filter agent_hostname != null and action_country != null
        | comp count() as conns, sum(action_total_upload) as upload_bytes by agent_hostname
        | sort desc upload_bytes`),
      explanation: 'All eight stitched flow rows have a country (the scanner in RU, 13.224.1.7 in US, the office egress in AU) but no agent_hostname, so without the null test they show up as a null "endpoint" with eight connections. With it, WS-FIN-042 leads with 52,800,641 bytes (the update.exe upload to the C2), then WS-SALES-023 with the AnyDesk relay. `!= null` is the documented way to test for a value.',
      docs: [st('presets', 'preset stage'), D.vpcflow, st('filter')],
      tags: ['tenant', 'network-story'],
    },
    {
      id: 'cloud-flows-08', concept: 'cloud-flows', type: 'write', difficulty: 4, title: 'What the scanner really did',
      task: 'Count only the flows the scanner started: records with `srcaddr` = 192.0.2.188 and `dstaddr` = the ALB 10.240.34.41. Return `dstport`, `action`, `connections` (count), `bytes_to_alb` (sum of `bytes`) and `first_seen` (earliest `_time`), oldest first.',
      solution: Q(`
        dataset = amazon_aws_raw
        | filter _log_type = "flowlogs" and srcaddr = "192.0.2.188" and dstaddr = "10.240.34.41"
        | comp count() as connections, sum(bytes) as bytes_to_alb, min(_time) as first_seen by dstport, action
        | sort asc first_seen`),
      hints: [
        'Stages: `filter` on `_log_type`, `srcaddr` and `dstaddr`, `comp count()`, `sum(bytes)` and `min(_time)` by port and action, `sort`.',
        '`dataset = amazon_aws_raw | filter _log_type = "flowlogs" and srcaddr = ___ and dstaddr = ___ | comp count() as connections, sum(bytes) as bytes_to_alb, min(_time) as first_seen by dstport, action | sort asc first_seen`',
        '`... | filter _log_type = "flowlogs" and srcaddr = "192.0.2.188" and dstaddr = "10.240.34.41" | comp count() as connections, sum(bytes) as bytes_to_alb, min(_time) as first_seen by dstport, action | sort asc first_seen`',
      ],
      explanation: 'The scanner opened eight connections: six accepted on 443 (13,250 bytes to the ALB) and two rejected probes on 22 and 3389. Counting every record that mentions 192.0.2.188 gives 14, because each accepted connection also has a reply record from the ALB; fix the direction with `srcaddr` before you count.',
      docs: [D.vpcflow, st('comp')],
      tags: ['tenant', 'vpc-flow'],
    },
    {
      id: 'cloud-flows-09', concept: 'cloud-flows', type: 'write', difficulty: 4, title: 'RDP into the Azure VM, counted once',
      task: 'From the NSG flow logs, count the RDP flows to VM-POLICYAPP-PROD-01 (destination 10.200.1.4, port 3389) per source, NSG rule and decision after removing duplicate deliveries (dedup on `sourceAddress`, `destinationAddress`, `sourcePort`, `destinationPort`, `startTime`). Return `sourceAddress`, `nsgRuleName`, `deviceAction`, `flows` (count) and `bytes_received` (sum of `bytesReceived`), most flows first, then by rule name.',
      solution: Q(`
        dataset = msft_azure_flowlogs_raw
        | filter destinationAddress = "10.200.1.4" and destinationPort = 3389
        | dedup sourceAddress, destinationAddress, sourcePort, destinationPort, startTime
        | comp count() as flows, sum(bytesReceived) as bytes_received by sourceAddress, nsgRuleName, deviceAction
        | sort desc flows, asc nsgRuleName`),
      hints: [
        'Stages: `filter` on the VM and port, `dedup` on the 5-tuple plus `startTime`, `comp` by source, rule and action, then `sort` on two keys.',
        '`dataset = msft_azure_flowlogs_raw | filter destinationAddress = "10.200.1.4" and destinationPort = 3389 | dedup ___ | comp count() as flows, sum(bytesReceived) as bytes_received by sourceAddress, nsgRuleName, deviceAction | sort desc flows, asc nsgRuleName`',
        '`... | dedup sourceAddress, destinationAddress, sourcePort, destinationPort, startTime | comp count() as flows, sum(bytesReceived) as bytes_received by sourceAddress, nsgRuleName, deviceAction | sort desc flows, asc nsgRuleName`',
      ],
      explanation: 'After dedup, 192.0.2.60 has two allowed RDP flows through ALLOW-RDP-TEMP (9,100,500 bytes back from the VM, a working remote session) and two denied ones after d.schrute removed the rule. Counting raw records doubles the allowed flows to 4 and their bytes to 18,201,000, because each was delivered twice. `deviceAction` is A or D and `flowDirection` I or O, relative to the VM\'s NIC.',
      docs: [D.nsg, st('dedup')],
      tags: ['tenant', 'nsg-flow'],
    },
    {
      id: 'cloud-flows-10', concept: 'cloud-flows', type: 'write', difficulty: 5, title: 'One query, three sensors',
      task: 'With one data model query over panw_ngfw_traffic_raw, amazon_aws_raw and msft_azure_flowlogs_raw, find every source that sent data to the C2 192.0.2.45 (`xdm.target.ipv4`) in a successful flow. Return `_dataset`, `xdm.observer.name`, `xdm.source.ipv4`, `flows` (count) and `sent_bytes` (sum of `xdm.source.sent_bytes`), largest first.',
      solution: Q(`
        datamodel dataset in (panw_ngfw_traffic_raw, amazon_aws_raw, msft_azure_flowlogs_raw)
        | filter xdm.target.ipv4 = "192.0.2.45" and xdm.event.outcome = XDM_CONST.OUTCOME_SUCCESS
        | comp count() as flows, sum(xdm.source.sent_bytes) as sent_bytes by _dataset, xdm.observer.name, xdm.source.ipv4
        | sort desc sent_bytes`),
      hints: [
        'Stages: `datamodel dataset in (...)` as the first stage, `filter` on `xdm.target.ipv4` and `xdm.event.outcome`, `comp` by dataset, observer and source, `sort`.',
        '`datamodel dataset in (panw_ngfw_traffic_raw, amazon_aws_raw, msft_azure_flowlogs_raw) | filter xdm.target.ipv4 = "192.0.2.45" and xdm.event.outcome = XDM_CONST.___ | comp count() as flows, sum(___) as sent_bytes by _dataset, xdm.observer.name, xdm.source.ipv4 | sort desc sent_bytes`',
        '`... | filter xdm.target.ipv4 = "192.0.2.45" and xdm.event.outcome = XDM_CONST.OUTCOME_SUCCESS | comp count() as flows, sum(xdm.source.sent_bytes) as sent_bytes by _dataset, xdm.observer.name, xdm.source.ipv4 | sort desc sent_bytes`',
      ],
      explanation: 'Four sensors saw data leave for the C2: 318,000,000 bytes from 10.240.70.5 in AWS, 212,000,000 from the Azure VM 10.200.1.4, 52,737,228 from WS-FIN-042 (10.10.20.42) on the on-prem firewall and 4,210,000 from s.hudson\'s Prisma Access tunnel, plus small sessions from three more hosts. The data model maps srcaddr, sourceAddress and source_ip to the same `xdm.source.ipv4`, so one filter covers every vendor; `datamodel` must be the first stage.',
      docs: [D.xdmNet, D.xdm],
      tags: ['tenant', 'datamodel'],
    },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : this);
