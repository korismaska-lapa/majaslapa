<?php
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");

$root = __DIR__;
require_once $root . "/cms-paths.php";
$contentDir = maska_content_dir($root);
$siteFile = $contentDir . "/site.json";
$postsDir = $contentDir . "/posts";
$sessionDir = $root . "/tmp/admin-sess";
$loginFile = $root . "/tmp/admin-login.json";
$passwordEncoded = "VGFzdHVuZGFuYWshITExMQ==";

@mkdir($root . "/tmp", 0755, true);
@mkdir($sessionDir, 0700, true);
@mkdir($root . "/media/uploads", 0755, true);
@mkdir($root . "/public/media/uploads", 0755, true);

$route = $_GET["r"] ?? "";
$method = $_SERVER["REQUEST_METHOD"] ?? "GET";

function json_input() {
  $raw = file_get_contents("php://input");
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function send_json($status, $payload) {
  http_response_code($status);
  echo json_encode($payload);
  exit;
}

function password_matches($password) {
  global $passwordEncoded;
  $expected = base64_decode($passwordEncoded, true);
  $actual = (string) $password;
  if ($expected === false || $expected === "" || strlen($actual) !== strlen($expected)) return false;
  return hash_equals($expected, $actual);
}

function cookie_secure() {
  $forwarded = explode(",", $_SERVER["HTTP_X_FORWARDED_PROTO"] ?? "");
  $proto = trim($forwarded[0] ?? "");
  return (!empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off") || $proto === "https";
}

function set_session_cookie($token) {
  $secure = cookie_secure() ? "; Secure" : "";
  if ($token) {
    header("Set-Cookie: maska_admin={$token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200{$secure}", false);
  } else {
    header("Set-Cookie: maska_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0{$secure}", false);
  }
}

function current_session() {
  global $sessionDir;
  $token = $_COOKIE["maska_admin"] ?? "";
  if ($token === "" || !preg_match("/^[a-f0-9]{64}$/", $token)) return null;
  $path = $sessionDir . "/" . $token;
  if (!is_file($path)) return null;
  $expires = (int) file_get_contents($path);
  if ($expires < time()) {
    @unlink($path);
    return null;
  }
  file_put_contents($path, (string) (time() + 43200));
  return $token;
}

function require_admin() {
  if (!current_session()) send_json(401, ["error" => "Authentication required"]);
  $origin = $_SERVER["HTTP_ORIGIN"] ?? "";
  if ($origin === "") return;
  $host = parse_url($origin, PHP_URL_HOST);
  $port = parse_url($origin, PHP_URL_PORT);
  $originHost = $port ? $host . ":" . $port : $host;
  if (strcasecmp($originHost, $_SERVER["HTTP_HOST"] ?? "") !== 0) {
    send_json(403, ["error" => "Origin rejected"]);
  }
}

function too_many_logins() {
  global $loginFile;
  $ip = $_SERVER["REMOTE_ADDR"] ?? "unknown";
  $now = time();
  $data = is_file($loginFile) ? json_decode(file_get_contents($loginFile), true) : [];
  if (!is_array($data)) $data = [];
  $attempt = $data[$ip] ?? ["count" => 0, "reset" => $now + 600];
  if (($attempt["reset"] ?? 0) < $now) $attempt = ["count" => 0, "reset" => $now + 600];
  $attempt["count"] = ($attempt["count"] ?? 0) + 1;
  $data[$ip] = $attempt;
  file_put_contents($loginFile, json_encode($data));
  return $attempt["count"] > 10;
}

function write_json_file($path, $value) {
  $dir = dirname($path);
  if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
    send_json(500, ["error" => "Cannot write file"]);
  }
  $temporary = $path . "." . bin2hex(random_bytes(6)) . ".tmp";
  $json = json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  if ($json === false || file_put_contents($temporary, $json . "\n") === false) {
    send_json(500, ["error" => "Cannot write file"]);
  }
  rename($temporary, $path);
}

function site_valid($value) {
  return is_array($value)
    && isset($value["copy"]["lv"], $value["copy"]["en"], $value["details"], $value["media"])
    && isset($value["stats"]) && is_array($value["stats"])
    && isset($value["achievements"]["lv"], $value["achievements"]["en"])
    && is_array($value["achievements"]["lv"]) && is_array($value["achievements"]["en"])
    && isset($value["programmes"]["lv"], $value["programmes"]["en"])
    && is_array($value["programmes"]["lv"]) && is_array($value["programmes"]["en"])
    && isset($value["albums"], $value["videos"], $value["voices"]["lv"], $value["voices"]["en"])
    && is_array($value["albums"]) && is_array($value["videos"])
    && is_array($value["voices"]["lv"]) && is_array($value["voices"]["en"])
    && (!isset($value["people"]) || is_array($value["people"]))
    && (!isset($value["carousel"]) || is_array($value["carousel"]));
}

function read_posts() {
  global $postsDir;
  $posts = [];
  foreach (glob($postsDir . "/*.json") ?: [] as $file) {
    $post = json_decode(file_get_contents($file), true);
    if (is_array($post)) $posts[] = $post;
  }
  usort($posts, function ($a, $b) {
    return strcmp($b["date"] ?? "", $a["date"] ?? "");
  });
  return $posts;
}

function slugify($value) {
  $map = [
    "ā" => "a", "č" => "c", "ē" => "e", "ģ" => "g", "ī" => "i", "ķ" => "k",
    "ļ" => "l", "ņ" => "n", "š" => "s", "ū" => "u", "ž" => "z"
  ];
  $value = function_exists("mb_strtolower")
    ? mb_strtolower((string) $value, "UTF-8")
    : strtolower((string) $value);
  $value = strtr($value, $map);
  $value = preg_replace("/[^a-z0-9]+/", "-", $value);
  return trim($value, "-") ?: ("post-" . time());
}

function paragraphs($value) {
  if (is_array($value)) {
    return array_values(array_filter(array_map("strval", $value)));
  }
  return array_values(array_filter(preg_split("/\n{2,}/", (string) $value)));
}

function normalize_post($input, $existing = []) {
  $title = [
    "lv" => trim((string) ($input["title"]["lv"] ?? "")),
    "en" => trim((string) ($input["title"]["en"] ?? ""))
  ];
  if ($title["lv"] === "") send_json(400, ["error" => "Latvian title is required"]);
  $body = [
    "lv" => paragraphs($input["body"]["lv"] ?? ""),
    "en" => paragraphs($input["body"]["en"] ?? "")
  ];
  return [
    "id" => $existing["id"] ?? ($input["id"] ?? (int) round(microtime(true) * 1000)),
    "slug" => slugify((string) ($input["slug"] ?? $title["lv"])),
    "date" => preg_match("/^\d{4}-\d{2}-\d{2}$/", $input["date"] ?? "") ? $input["date"] : ($existing["date"] ?? date("Y-m-d")),
    "title" => $title,
    "excerpt" => [
      "lv" => substr(trim((string) ($input["excerpt"]["lv"] ?? ($body["lv"][0] ?? ""))), 0, 320),
      "en" => substr(trim((string) ($input["excerpt"]["en"] ?? ($body["en"][0] ?? ""))), 0, 320)
    ],
    "body" => $body,
    "image" => (string) ($input["image"] ?? ($existing["image"] ?? "/media/maska-placeholder.jpg"))
  ];
}

function save_upload($tmp, $filename) {
  global $root;
  $saved = null;
  foreach ([$root . "/media/uploads", $root . "/public/media/uploads"] as $dir) {
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) continue;
    $dest = $dir . "/" . $filename;
    if ($saved === null) {
      if (!move_uploaded_file($tmp, $dest)) continue;
      $saved = $dest;
    } elseif (!is_file($dest)) {
      @copy($saved, $dest);
    }
    @chmod($dest, 0644);
  }
  return $saved;
}

function post_filename($post) {
  return ($post["date"] ?? "") . "-" . ($post["slug"] ?? "post") . ".json";
}

if ($route === "session" && $method === "GET") {
  send_json(200, ["authenticated" => (bool) current_session()]);
}

if ($route === "login" && $method === "POST") {
  if (too_many_logins()) send_json(429, ["error" => "Too many attempts. Try again later."]);
  $password = json_input()["password"] ?? "";
  if (!password_matches($password)) send_json(401, ["error" => "Incorrect password"]);
  $token = bin2hex(random_bytes(32));
  file_put_contents($sessionDir . "/" . $token, (string) (time() + 43200));
  set_session_cookie($token);
  send_json(200, ["authenticated" => true]);
}

if ($route === "logout" && $method === "POST") {
  $token = current_session();
  if ($token) @unlink($sessionDir . "/" . $token);
  set_session_cookie("");
  send_json(200, ["authenticated" => false]);
}

if ($route === "site" && $method === "PUT") {
  require_admin();
  $body = json_input();
  if (!site_valid($body)) send_json(400, ["error" => "Required site sections are missing or malformed"]);
  write_json_file($siteFile, $body);
  send_json(200, ["site" => $body]);
}

if ($route === "upload" && $method === "POST") {
  require_admin();
  if (empty($_FILES["file"]["tmp_name"])) send_json(400, ["error" => "No supported file supplied"]);
  $name = $_FILES["file"]["name"] ?? "upload";
  $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
  if (!in_array($ext, ["jpg", "jpeg", "jfif", "png", "gif", "webp", "svg", "pdf", "mp3", "wav", "ogg"], true)) {
    send_json(400, ["error" => "No supported file supplied"]);
  }
  $safe = preg_replace("/[^a-z0-9]+/", "-", strtolower(pathinfo($name, PATHINFO_FILENAME)));
  $safe = trim($safe, "-") ?: "photo";
  $filename = time() . "-" . substr($safe, 0, 80) . "." . $ext;
  if (!save_upload($_FILES["file"]["tmp_name"], $filename)) {
    send_json(500, ["error" => "Upload failed"]);
  }
  http_response_code(201);
  echo json_encode(["path" => "/media/uploads/" . $filename]);
  exit;
}

if ($route === "posts") {
  require_admin();
  $id = $_GET["id"] ?? "";
  $action = $_GET["action"] ?? "";
  $isDelete = $method === "DELETE" || ($method === "POST" && $action === "delete");
  if ($method === "POST" && !$isDelete) {
    $post = normalize_post(json_input());
    $path = $postsDir . "/" . post_filename($post);
    if (is_file($path)) send_json(409, ["error" => "A post with this date and URL identifier already exists"]);
    write_json_file($path, $post);
    http_response_code(201);
    echo json_encode(["post" => $post]);
    exit;
  }
  if ($method === "PUT" && $id !== "") {
    $existing = null;
    $oldFile = null;
    foreach (read_posts() as $item) {
      if ((string) ($item["id"] ?? "") === (string) $id) {
        $existing = $item;
        $oldFile = $postsDir . "/" . post_filename($item);
        break;
      }
    }
    if (!$existing) send_json(404, ["error" => "Post not found"]);
    $post = normalize_post(json_input(), $existing);
    $newFile = $postsDir . "/" . post_filename($post);
    if ($oldFile !== $newFile && is_file($newFile)) {
      send_json(409, ["error" => "Another post already uses this date and URL identifier"]);
    }
    write_json_file($newFile, $post);
    if ($oldFile && $oldFile !== $newFile && is_file($oldFile)) @unlink($oldFile);
    send_json(200, ["post" => $post]);
  }
  if ($isDelete && $id !== "") {
    foreach (glob($postsDir . "/*.json") ?: [] as $file) {
      $item = json_decode(file_get_contents($file), true);
      if (!is_array($item) || (string) ($item["id"] ?? "") !== (string) $id) continue;
      if (!@unlink($file)) send_json(500, ["error" => "Cannot delete post"]);
      http_response_code(204);
      exit;
    }
    send_json(404, ["error" => "Post not found"]);
  }
}

send_json(404, ["error" => "Unknown admin route"]);
