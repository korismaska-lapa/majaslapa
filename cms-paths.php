<?php
function maska_content_dir($root) {
  $live = $root . "/data/content";
  $seed = $root . "/content";
  if (!is_dir($live . "/posts") && !@mkdir($live . "/posts", 0755, true) && !is_dir($live . "/posts")) {
    return is_dir($seed) ? $seed : $live;
  }
  if (!is_file($live . "/site.json") && is_file($seed . "/site.json")) {
    @copy($seed . "/site.json", $live . "/site.json");
  }
  if (!is_file($live . "/voices.json") && is_file($seed . "/voices.json")) {
    @copy($seed . "/voices.json", $live . "/voices.json");
  }
  if (is_file($live . "/site.json")) {
    $site = json_decode(@file_get_contents($live . "/site.json"), true);
    $copyChanged = false;
    if (is_array($site)) {
      if (($site["copy"]["lv"]["listen"] ?? "") === "Klausies kori") {
        $site["copy"]["lv"]["listen"] = "Mūsu darbi";
        $copyChanged = true;
      }
      if (($site["copy"]["en"]["listen"] ?? "") === "Listen to the choir") {
        $site["copy"]["en"]["listen"] = "Our music";
        $copyChanged = true;
      }
      if ($copyChanged) {
        @file_put_contents($live . "/site.json", json_encode($site, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n");
      }
    }
  }
  $marker = $live . "/.initialized";
  $livePosts = glob($live . "/posts/*.json") ?: [];
  if (!is_file($marker) && !$livePosts) {
    foreach (glob($seed . "/posts/*.json") ?: [] as $file) {
      $dest = $live . "/posts/" . basename($file);
      if (!is_file($dest)) @copy($file, $dest);
    }
  }
  if (!is_file($marker)) {
    @file_put_contents($marker, (string) time());
  }
  return $live;
}
