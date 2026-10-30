<?php
// Receives an anonymous layout report from the tool and opens a GitHub issue. The GitHub token stays on this server.
// Install: upload to /ocr/report.php, copy report-config.sample.php to ONE LEVEL ABOVE public_html as yv-report-config.php and fill it in.
header('Content-Type: application/json'); header('X-Content-Type-Options: nosniff');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit('{"ok":false}'); }
$cfg = @include dirname($_SERVER['DOCUMENT_ROOT']) . '/yv-report-config.php';
if (!is_array($cfg) || empty($cfg['token']) || empty($cfg['repo'])) { http_response_code(500); exit('{"ok":false}'); }
$raw = file_get_contents('php://input', false, null, 0, 8001);
if (strlen($raw) > 8000) { http_response_code(413); exit('{"ok":false}'); }
$d = json_decode($raw, true); if (!is_array($d)) { http_response_code(400); exit('{"ok":false}'); }
// accept ONLY the known layout fields; mask every digit so nothing personal can slip through
$mask = function ($s) { return substr(preg_replace('/[0-9]/', '#', (string)$s), 0, 60); };
$out = ['bank' => $mask($d['bank'] ?? ''), 'accountType' => $mask($d['accountType'] ?? ''), 'parseMode' => $mask($d['parseMode'] ?? ''), 'ocrUsed' => !empty($d['ocrUsed']),
  'rows' => (int)($d['rows'] ?? 0), 'chainRatio' => isset($d['chainRatio']) ? round((float)$d['chainRatio'], 3) : null, 'reconciled' => $d['reconciled'] ?? null,
  'mismatchRows' => (int)($d['mismatchRows'] ?? 0), 'pdfjs' => $mask($d['pdfjs'] ?? ''), 'headerColumns' => []];
foreach (array_slice((array)($d['headerColumns'] ?? []), 0, 20) as $c) $out['headerColumns'][] = $mask($c);
// de-duplicate and rate-limit on the server
$dir = sys_get_temp_dir() . '/yv_reports'; @mkdir($dir, 0700, true);
$hash = md5(json_encode([$out['bank'], $out['headerColumns'], $out['parseMode']]));
if (file_exists("$dir/$hash")) exit('{"ok":true,"dup":true}');
$ipf = "$dir/ip_" . md5($_SERVER['REMOTE_ADDR'] ?? '') . date('YmdH'); $n = (int)@file_get_contents($ipf);
if ($n >= 5) { http_response_code(429); exit('{"ok":false}'); } file_put_contents($ipf, $n + 1);
touch("$dir/$hash");
$title = 'Layout report: ' . ($out['bank'] ?: 'unknown bank') . ' (' . $out['parseMode'] . ', ' . $out['rows'] . ' rows)';
$body = "Automatic layout-only report (no personal data).\n\n```json\n" . json_encode($out, JSON_PRETTY_PRINT) . "\n```\n";
$ch = curl_init('https://api.github.com/repos/' . $cfg['repo'] . '/issues');
curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
  CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $cfg['token'], 'User-Agent: yourview-report', 'Accept: application/vnd.github+json', 'Content-Type: application/json'],
  CURLOPT_POSTFIELDS => json_encode(['title' => $title, 'body' => $body, 'labels' => ['layout-report']])]);
curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
echo json_encode(['ok' => $code === 201]);
