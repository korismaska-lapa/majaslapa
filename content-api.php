<?php
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");

$root = __DIR__;
$siteFile = $root . "/content/site.json";
$voicesFile = $root . "/content/voices.json";
$postsDir = $root . "/content/posts";

$site = is_file($siteFile) ? json_decode(file_get_contents($siteFile), true) : null;
$voices = is_file($voicesFile) ? json_decode(file_get_contents($voicesFile), true) : [];
if (!is_array($site)) {
  http_response_code(500);
  echo json_encode(["error" => "Site content is unavailable"]);
  exit;
}

$posts = [];
foreach (glob($postsDir . "/*.json") ?: [] as $file) {
  $post = json_decode(file_get_contents($file), true);
  if (is_array($post)) $posts[] = $post;
}
usort($posts, function ($a, $b) {
  return strcmp($b["date"] ?? "", $a["date"] ?? "");
});

echo json_encode(["site" => $site, "posts" => $posts, "voices" => $voices]);
