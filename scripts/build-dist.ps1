# Składa gotową aplikację do folderu dist/ (strona www + źródło dla instalatora Windows).
# Uruchamiane automatycznie przez GitHub Actions; można też lokalnie: pwsh scripts/build-dist.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dist = Join-Path $root 'dist'
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$files = 'index.html', 'app.js', 'styles.css', 'config.js', 'manifest.webmanifest', 'sw.js',
         'icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable.png', 'listo.ico'
foreach ($f in $files) { Copy-Item (Join-Path $root $f) (Join-Path $dist $f) }
# nowy numer wersji pamięci podręcznej → telefony i komputery pobiorą świeże pliki
$ver = 'listo-team-' + (Get-Date -Format 'yyyyMMddHHmmss')
$sw = Join-Path $dist 'sw.js'
$utf8 = New-Object System.Text.UTF8Encoding $false
[IO.File]::WriteAllText($sw, ([IO.File]::ReadAllText($sw, $utf8) -replace "listo-team-dev", $ver), $utf8)
# numer wersji w adresach plików – przeglądarka nie może użyć starej kopii z pamięci
$ix = Join-Path $dist 'index.html'
$html = [IO.File]::ReadAllText($ix, $utf8)
$html = $html -replace 'href="styles\.css"', "href=""styles.css?v=$ver""" -replace 'src="app\.js"', "src=""app.js?v=$ver""" -replace 'src="config\.js"', "src=""config.js?v=$ver""" -replace '<meta name="lt-version" content="dev">', "<meta name=""lt-version"" content=""$ver"">"
[IO.File]::WriteAllText($ix, $html, $utf8)
# plik z numerem wersji – otwarta aplikacja sprawdza go i sama się odświeża
[IO.File]::WriteAllText((Join-Path $dist 'version.json'), "{""v"":""$ver""}", $utf8)
New-Item -ItemType File -Path (Join-Path $dist '.nojekyll') -Force | Out-Null
"dist gotowy ($ver)"
