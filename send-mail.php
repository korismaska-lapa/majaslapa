<?php
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");

if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
  http_response_code(405);
  echo json_encode(["error" => "POST required"]);
  exit;
}

$raw = file_get_contents("php://input");
$input = json_decode($raw, true);
if (!is_array($input)) {
  $input = $_POST;
}

if (!empty($input["website"])) {
  echo json_encode(["sent" => true]);
  exit;
}

$name = trim((string) ($input["name"] ?? ""));
$email = trim((string) ($input["email"] ?? ""));
$phone = trim((string) ($input["phone"] ?? ""));
$voice = trim((string) ($input["voice"] ?? ""));
$kind = (($input["kind"] ?? "") === "join") ? "join" : "contact";
$subject = trim((string) ($input["subject"] ?? ""));
if ($kind === "join" && $subject === "") {
  $subject = "Pieteikums korim — " . $name;
}
$message = trim((string) ($input["message"] ?? ""));

if ($name === "" || $subject === "" || $message === "" || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
  http_response_code(400);
  echo json_encode(["error" => "Please complete all required fields."]);
  exit;
}

$to = "korismaska@gmail.com, dirigents@gmail.com, laurarozenberga2@gmail.com";
$from = "Koris MASKA <korismaska@korismaska.lv>";
$safeName = str_replace(["\r", "\n", "\""], "", $name);
$fields = [
  ["Vārds", $name],
  ["E-pasts", $email],
];
if ($kind === "join" || $phone !== "") {
  $fields[] = ["Tālrunis", $phone !== "" ? $phone : "—"];
}
if ($kind === "join" || $voice !== "") {
  $fields[] = ["Balss grupa", $voice !== "" ? $voice : "—"];
}
if ($kind === "contact") {
  $fields[] = ["Tēma", $subject];
}

$kicker = $kind === "join" ? "Pieteikums korim" : "Raksti mums";
$heading = $kind === "join" ? "Jauns pieteikums korim" : "Jauna ziņa no mājaslapas";
$messageLabel = $kind === "join" ? "Ziņa" : "Jautājums";

$textRows = [];
foreach ($fields as [$label, $value]) {
  $textRows[] = str_pad($label . ":", 14) . $value;
}
$text = implode("\n", [
  "KORIS MASKA",
  $heading,
  str_repeat("─", 36),
  implode("\n", $textRows),
  "",
  $messageLabel,
  str_repeat("─", 36),
  $message,
]);

$h = static function ($value) {
  return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8");
};
$rowsHtml = "";
foreach ($fields as [$label, $value]) {
  $display = $h($value);
  if ($label === "E-pasts" && $value !== "—") {
    $display = '<a href="mailto:' . $h($value) . '" style="color:#1e2429;text-decoration:none;border-bottom:1px solid #5bc2ce">' . $h($value) . "</a>";
  } elseif ($label === "Tālrunis" && $value !== "—" && $value !== "") {
    $tel = preg_replace("/[^\d+]/", "", $value);
    $display = '<a href="tel:' . $h($tel) . '" style="color:#1e2429;text-decoration:none;border-bottom:1px solid #5bc2ce">' . $h($value) . "</a>";
  }
  $rowsHtml .= '<tr>
    <td style="padding:11px 0 10px;border-bottom:1px solid #e6eaed;width:34%;vertical-align:top;font:600 11px/1.3 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#3aa3af">' . $h($label) . '</td>
    <td style="padding:11px 0 10px;border-bottom:1px solid #e6eaed;font:600 16px/1.45 Arial,sans-serif;color:#1e2429">' . $display . "</td>
  </tr>";
}

$html = '<!doctype html>
<html lang="lv"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#eef2f4;font-family:Arial,sans-serif;color:#1e2429">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d7dee2">
    <tr>
      <td style="padding:22px 28px 18px;background:#1e2429;color:#fff">
        <div style="font:600 11px/1.3 Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#5bc2ce">' . $h($kicker) . '</div>
        <div style="margin-top:8px;font:700 22px/1.25 Arial,sans-serif">' . $h($heading) . '</div>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 28px 6px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">' . $rowsHtml . '</table>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px 28px">
        <div style="font:600 11px/1.3 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#3aa3af;margin-bottom:10px">' . $h($messageLabel) . '</div>
        <div style="padding:16px 18px;background:#f4f8f9;border-left:3px solid #5bc2ce;font:16px/1.55 Arial,sans-serif;white-space:pre-wrap">' . nl2br($h($message)) . '</div>
      </td>
    </tr>
  </table>
</body></html>';

$boundary = "maska_" . bin2hex(random_bytes(8));
$headers = implode("\r\n", [
  "From: {$from}",
  "Reply-To: \"{$safeName}\" <{$email}>",
  "MIME-Version: 1.0",
  "Content-Type: multipart/alternative; boundary=\"{$boundary}\"",
]);
$body = "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n{$text}\r\n\r\n--{$boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n{$html}\r\n\r\n--{$boundary}--\r\n";

if (!@mail($to, $subject, $body, $headers)) {
  http_response_code(500);
  echo json_encode(["error" => "php mail() failed"]);
  exit;
}

echo json_encode(["sent" => true]);
