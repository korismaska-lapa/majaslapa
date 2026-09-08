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

$to = "korismaska@gmail.com";
$from = "Koris MASKA <korismaska@korismaska.lv>";
$body = ($kind === "join" ? "Jauns pieteikums korim no mājaslapas.\n" : "Jauna ziņa no formas Raksti mums.\n")
  . "\nVārds: {$name}\nE-pasts: {$email}\n\n{$message}";
$safeName = str_replace(["\r", "\n", "\""], "", $name);
$headers = "From: {$from}\r\nReply-To: \"{$safeName}\" <{$email}>\r\nContent-Type: text/plain; charset=UTF-8";

if (!@mail($to, $subject, $body, $headers)) {
  http_response_code(500);
  echo json_encode(["error" => "php mail() failed"]);
  exit;
}

echo json_encode(["sent" => true]);
