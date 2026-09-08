<?php
if ($argc < 5) {
  fwrite(STDERR, "usage: send-mail.php to subject from reply\n");
  exit(1);
}
$to = $argv[1];
$subject = $argv[2];
$from = $argv[3];
$reply = $argv[4];
$body = stream_get_contents(STDIN);
$headers = "From: {$from}\r\nReply-To: {$reply}\r\nContent-Type: text/plain; charset=UTF-8";
if (!@mail($to, $subject, $body, $headers)) {
  fwrite(STDERR, "php mail() returned false\n");
  exit(1);
}
