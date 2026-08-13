#requires -Version 5
<#
  build.ps1 — Dashboard de trafego (VENDA DIRETA / LANCAMENTO) Familia Aprovada
  Lancamento "A Proxima Carreira" (Sala Secreta) — evento 27/08/2026.
  Le 2 planilhas Google via gviz CSV (compartilhadas por link) e gera data.js.

  Fontes:
    - Queries (Adveronix): Day, Campaign Name, Ad Set Name, Ad Name, Amount Spent,
      Impressions, Reach, Link Clicks, Landing Page Views, Purchases,
      Checkouts Initiated, Purchases Conversion Value, 3-Second Video Views, Video Watches at 75%.
      (colunas localizadas por NOME de cabecalho — robusto a ordem)
    - Vendas (checkout Tutory): data_venda, nome, email, telefone, utm_source, utm_campaign,
      utm_medium, utm_content, utm_term, faturamento, produto, pais, estado, cidade.
      TEM UTMs -> atribuicao REAL venda->campanha por utm_campaign, venda->anuncio por utm_content
      (decodifica URL-encode antes de casar). Sem coluna de status -> toda linha = venda aprovada.

  Modelo: daily[] (funil por dia, cruza Adveronix x Tutory) + grain[] (por dia x anuncio).
  Faturamento/vendas = Tutory (fonte da verdade, filtrado ao lancamento por utm_campaign).
  Atribuicao de compra por anuncio = PIXEL (coluna Purchases do Adveronix) — sinal de otimizacao.
  Imposto x1.1385 sobre TODO gasto (Meta Ads). Filtro do lancamento = prefixo "AGO26PC".
  Publica so agregados (sem PII da planilha de vendas).
#>
param([string]$Mode = "all")

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ---------------- CONFIG ----------------
$SHEET_QUERIES = "1F2_6lGJHuqXZ2yaDqTzoV8GGrDYcr7_5VeqJLw_OwmE"  # Adveronix (Planilha - Proxima Carreira)
$GID_QUERIES   = "0"
$SHEET_VENDAS  = "1io1XMhFiGOsrvBAJ23Q1RirQariw49onguZ3R_TeZqc"  # Vendas checkout Tutory
$GID_VENDAS    = "0"
$TAX           = 1.1385   # imposto Meta Ads

# Filtro do LANCAMENTO: nome/utm_campaign contem qualquer um destes (case/acento-insensitive).
# Prefixo real da campanha que subiu: AGO26APC = "AGO/26 A Proxima Carreira".
# (o brief previa AGO26PC, mas a campanha subiu com o "A" de "A Proxima Carreira": AGO26APC)
$LAUNCH_KEYS   = @("AGO26APC")

# Metas do lancamento (brief): ingresso R$47, LTV R$467, CPA meta R$61 / limite R$100,
# meta 228 ingressos / piso 150, verba R$15.000, captacao 12/08 a 27/08.
$LAUNCH = [ordered]@{
  goal      = 228          # meta de ingressos
  floor     = 150          # piso de ingressos
  cpaTarget = 61.0         # CPA meta (R$)
  cpaLimit  = 100.0        # CPA limite (R$)
  ticket    = 47.0         # preco do ingresso (R$)
  ltv       = 467.0        # valor por ingresso c/ conversao p/ mentoria (R$)
  budget    = 15000.0      # verba total de captacao (R$)
  startDate = "2026-08-12"
  deadline  = "2026-08-27" # evento
}

$OutFile = Join-Path $PSScriptRoot "data.js"

# ---------------- HELPERS ----------------
function Get-Csv($sheetId, $gid) {
  $url = "https://docs.google.com/spreadsheets/d/$sheetId/gviz/tq?tqx=out:csv&gid=$gid"
  $tmp = [IO.Path]::GetTempFileName()
  try {
    $wc = New-Object System.Net.WebClient
    $wc.Encoding = [Text.Encoding]::UTF8
    $wc.DownloadFile($url, $tmp)   # WebClient segue redirect do gviz sozinho
    $lines = [IO.File]::ReadAllLines($tmp, [Text.Encoding]::UTF8)
  } finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
  # gviz aspa TODO campo e separa por '","' ; sem newline embutido nos nossos dados
  $rows = New-Object System.Collections.Generic.List[object]
  foreach ($ln in $lines) {
    if ([string]::IsNullOrEmpty($ln)) { continue }
    $t = $ln
    if ($t.StartsWith('"')) { $t = $t.Substring(1) }
    if ($t.EndsWith('"'))   { $t = $t.Substring(0, $t.Length - 1) }
    $rows.Add(($t -split '","'))
  }
  return ,$rows   # virgula: impede o PS de desenrolar a lista de 1 elemento (planilha so-cabecalho)
}

function ToNum($s) {
  if ($null -eq $s) { return 0.0 }
  $x = ("$s").Trim()
  if ($x -eq "") { return 0.0 }
  $x = $x -replace '[^0-9,.\-]', ''       # tira R$, espacos, etc
  if ($x -eq "" -or $x -eq "-") { return 0.0 }
  # pt-BR: ponto = milhar, virgula = decimal
  if ($x.Contains(",")) { $x = ($x -replace '\.', '') -replace ',', '.' }
  $out = 0.0
  if ([double]::TryParse($x, [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$out)) { return $out }
  return 0.0
}

function Norm($s) {
  # uppercase + remove acentos, pra casar filtro/cabecalho
  $u = ("$s").ToUpperInvariant()
  $n = $u.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object Text.StringBuilder
  foreach ($c in $n.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($c) -ne [Globalization.UnicodeCategory]::NonSpacingMark) { [void]$sb.Append($c) }
  }
  return $sb.ToString()
}

# decodifica UTM URL-encodada: %7C->|, +->espaco, %20->espaco etc. (pra casar com nome do anuncio)
function UtmDecode($s) {
  if ($null -eq $s) { return "" }
  $v = ("$s").Trim()
  $v = $v -replace '\+', ' '
  try { $v = [Uri]::UnescapeDataString($v) } catch {}
  return $v.Trim()
}

function IsLaunch($name) {
  $c = Norm $name
  foreach ($k in $LAUNCH_KEYS) { if ($c.Contains((Norm $k))) { return $true } }
  return $false
}

# acha o indice da 1a coluna cujo cabecalho (normalizado) casa $include e nao casa $exclude
function ColIdx($hdr, $include, $exclude) {
  for ($i = 0; $i -lt $hdr.Count; $i++) {
    $h = Norm $hdr[$i]
    if (($h -match $include) -and (-not $exclude -or ($h -notmatch $exclude))) { return $i }
  }
  return -1
}

function JsonStr($items) {
  if (-not $items -or $items.Count -eq 0) { return "[]" }
  $parts = foreach ($it in $items) { $it | ConvertTo-Json -Compress -Depth 6 }
  return "[" + ($parts -join ",") + "]"
}

# ---------------- QUERIES (Adveronix) ----------------
Write-Host "Baixando Queries (Adveronix)..."
$q = Get-Csv $SHEET_QUERIES $GID_QUERIES
$grain = New-Object System.Collections.Generic.List[object]
$dq = @{}   # date -> agregados adveronix do lancamento
if ($q.Count -lt 1) { throw "Planilha Queries vazia." }
$H = $q[0]
$iDay   = ColIdx $H 'DAY|DATE' $null
$iCamp  = ColIdx $H 'CAMPAIGN' $null
$iAdset = ColIdx $H 'AD ?SET' $null
$iAd    = ColIdx $H 'AD NAME' $null; if ($iAd -lt 0) { $iAd = ColIdx $H '^AD$|ANUNCIO' $null }
$iSpend = ColIdx $H 'AMOUNT SPENT|SPENT|SPEND|GASTO' $null
$iImpr  = ColIdx $H 'IMPRESSION|IMPRESSO' $null
$iReach = ColIdx $H 'REACH|ALCANCE' $null
$iClk   = ColIdx $H 'LINK CLICK' $null; if ($iClk -lt 0) { $iClk = ColIdx $H 'CLICK|CLIQUE' 'COST|CUSTO|UNIQUE|ALL' }
$iLpv   = ColIdx $H 'LANDING PAGE VIEW|PAGE VIEW|VISUALIZ' $null
$iPur   = ColIdx $H 'PURCHASE|COMPRA' 'VALUE|VALOR|CONVERSION|ROAS|COST|CUSTO|OUT|CART'
$iVal   = ColIdx $H 'CONVERSION VALUE|PURCHASE.*VALUE|VALOR.*CONVERS' $null
$iIc    = ColIdx $H '(CHECKOUT.*INITIAT)|(INITIAT.*CHECKOUT)|(FINALIZ.*COMPRA)' 'COST|CUSTO|VALUE|VALOR|UNIQUE|MOBILE|PER '
$iV3    = ColIdx $H '3.?SECOND|SECOND VIDEO|VIDEO.*3' 'COST|CUSTO'
$iV75   = ColIdx $H '75' 'COST|CUSTO'
Write-Host ("  colunas: day={0} camp={1} adset={2} ad={3} spend={4} impr={5} reach={6} clk={7} lpv={8} pur={9} ic={10} val={11} v3={12} v75={13}" -f $iDay,$iCamp,$iAdset,$iAd,$iSpend,$iImpr,$iReach,$iClk,$iLpv,$iPur,$iIc,$iVal,$iV3,$iV75)
if ($iDay -lt 0 -or $iCamp -lt 0 -or $iSpend -lt 0) { throw "Colunas essenciais (Day/Campaign/Spend) nao encontradas no cabecalho do Adveronix." }

function Cell($r, $i) { if ($i -ge 0 -and $r.Count -gt $i) { return $r[$i] } else { return "" } }
$skipHdr = $true
foreach ($r in $q) {
  if ($skipHdr) { $skipHdr = $false; continue }
  $day = ("$(Cell $r $iDay)").Trim()
  if ($day -notmatch '^\d{4}-\d{2}-\d{2}$') { continue }
  $camp = ("$(Cell $r $iCamp)").Trim()
  if (-not (IsLaunch $camp)) { continue }
  $spend = (ToNum (Cell $r $iSpend)) * $TAX
  $impr  = [int](ToNum (Cell $r $iImpr)); $reach = [int](ToNum (Cell $r $iReach)); $clk = [int](ToNum (Cell $r $iClk))
  $lpv   = [int](ToNum (Cell $r $iLpv)); $pur = [int](ToNum (Cell $r $iPur)); $val = (ToNum (Cell $r $iVal))
  $icpx  = [int](ToNum (Cell $r $iIc)); $v3 = [int](ToNum (Cell $r $iV3)); $v75 = [int](ToNum (Cell $r $iV75))
  $grain.Add([ordered]@{ d=$day; camp=$camp; adset=("$(Cell $r $iAdset)").Trim(); ad=("$(Cell $r $iAd)").Trim();
    spend=[math]::Round($spend,2); impr=$impr; reach=$reach; clk=$clk; lpv=$lpv; pur=$pur; val=[math]::Round($val,2); icpx=$icpx; v3=$v3; v75=$v75 })
  if (-not $dq.ContainsKey($day)) { $dq[$day] = @{ spend=0.0; impr=0; clk=0; lpv=0; pur=0; val=0.0; icpx=0; reach=0; v3=0; v75=0 } }
  $dq[$day].spend += $spend; $dq[$day].impr += $impr; $dq[$day].clk += $clk
  $dq[$day].lpv += $lpv; $dq[$day].pur += $pur; $dq[$day].val += $val; $dq[$day].icpx += $icpx
  $dq[$day].reach += $reach; $dq[$day].v3 += $v3; $dq[$day].v75 += $v75
}
Write-Host ("  linhas do lancamento: {0} | dias: {1}" -f $grain.Count, $dq.Keys.Count)

# ---------------- VENDAS (Tutory, por UTM) ----------------
Write-Host "Baixando Vendas (Tutory)..."
$v = Get-Csv $SHEET_VENDAS $GID_VENDAS
$dv = @{}       # date -> { vendas, fat }   (total do lancamento, por dia)
$salesCamp = @{}  # date -> campDecoded -> { vendas, fat }   (atribuido por utm_campaign)
$attrAd = 0
if ($v.Count -ge 1) {
  $HV = $v[0]
  $jDt   = ColIdx $HV 'DATA.?VENDA|DATA|DATE|CREATED|TIMESTAMP' $null
  $jCamp = ColIdx $HV 'UTM.?CAMPAIGN' $null
  $jCont = ColIdx $HV 'UTM.?CONTENT' $null
  $jTerm = ColIdx $HV 'UTM.?TERM' $null
  $jFat  = ColIdx $HV 'FATURAMENTO|VALOR|VALUE|AMOUNT|PRICE|TOTAL' 'UTM'
  Write-Host ("  colunas vendas: dt={0} utm_campaign={1} utm_content={2} utm_term={3} fat={4}" -f $jDt,$jCamp,$jCont,$jTerm,$jFat)
  $skipHdr = $true
  foreach ($r in $v) {
    if ($skipHdr) { $skipHdr = $false; continue }
    $dt = ("$(Cell $r $jDt)").Trim()
    $day = ""
    if ($dt -match '^(\d{4})-(\d{2})-(\d{2})') { $day = "{0}-{1}-{2}" -f $matches[1], $matches[2], $matches[3] }
    elseif ($dt -match '^(\d{2})/(\d{2})/(\d{4})') { $day = "{0}-{1}-{2}" -f $matches[3], $matches[2], $matches[1] }
    else { continue }
    $utmCamp = UtmDecode (Cell $r $jCamp)
    # so conta venda do lancamento (utm_campaign contem AGO26PC). Se utm vazio, NAO atribui ao lancamento.
    if (-not (IsLaunch $utmCamp)) { continue }
    $fat = (ToNum (Cell $r $jFat))
    if (-not $dv.ContainsKey($day)) { $dv[$day] = @{ vendas=0; fat=0.0 } }
    $dv[$day].vendas += 1; $dv[$day].fat += $fat
    if (-not $salesCamp.ContainsKey($day)) { $salesCamp[$day] = @{} }
    if (-not $salesCamp[$day].ContainsKey($utmCamp)) { $salesCamp[$day][$utmCamp] = @{ vendas=0; fat=0.0 } }
    $salesCamp[$day][$utmCamp].vendas += 1; $salesCamp[$day][$utmCamp].fat += $fat
    if ((UtmDecode (Cell $r $jCont)) -ne "") { $attrAd++ }
  }
}
$totVendas = 0; ($dv.Values | ForEach-Object { $totVendas += $_.vendas })
Write-Host ("  dias com venda: {0} | vendas do lancamento: {1} | com utm_content: {2}" -f $dv.Keys.Count, $totVendas, $attrAd)

# achata salesCamp -> lista [{d,camp,vendas,fat}] (reserva p/ atribuicao por campanha no front)
$salesList = New-Object System.Collections.Generic.List[object]
foreach ($day in $salesCamp.Keys) {
  foreach ($cmp in $salesCamp[$day].Keys) {
    $s = $salesCamp[$day][$cmp]
    $salesList.Add([ordered]@{ d=$day; camp=$cmp; vendas=$s.vendas; fat=[math]::Round($s.fat,2) })
  }
}

# ---------------- MERGE daily ----------------
$allDays = New-Object System.Collections.Generic.SortedSet[string]
foreach ($k in $dq.Keys) { [void]$allDays.Add($k) }
foreach ($k in $dv.Keys) { [void]$allDays.Add($k) }
$daily = New-Object System.Collections.Generic.List[object]
foreach ($day in $allDays) {
  $a = $dq[$day]; $s = $dv[$day]
  $spend = if ($a) { $a.spend } else { 0.0 }
  $impr  = if ($a) { $a.impr }  else { 0 }
  $clk   = if ($a) { $a.clk }   else { 0 }
  $lpv   = if ($a) { $a.lpv }   else { 0 }
  $pur   = if ($a) { $a.pur }   else { 0 }
  $pval  = if ($a) { $a.val }   else { 0.0 }
  $icpx  = if ($a) { $a.icpx }  else { 0 }
  $vend  = if ($s) { $s.vendas } else { 0 }
  $fat   = if ($s) { $s.fat }    else { 0.0 }
  $daily.Add([ordered]@{ d=$day; spend=[math]::Round($spend,2); impr=$impr; clk=$clk; lpv=$lpv;
    purPixel=$pur; valPixel=[math]::Round($pval,2); vendas=$vend; fat=[math]::Round($fat,2); checkouts=0; icPixel=$icpx })
}

# ---------------- OUTPUT data.js ----------------
$now = [DateTime]::UtcNow.AddHours(-3)   # BRT
$meta = [ordered]@{ generatedAt = $now.ToString("yyyy-MM-dd HH:mm"); tz="BRT"; tax=$TAX; launchKeys=$LAUNCH_KEYS;
  product="A Proxima Carreira - Sala Secreta (Familia Aprovada)"; launch=$LAUNCH }

$js = "window.DASH=" + ($meta | ConvertTo-Json -Compress -Depth 5) + ";" + [Environment]::NewLine
$js += "window.DASH.daily=" + (JsonStr $daily) + ";" + [Environment]::NewLine
$js += "window.DASH.grain=" + (JsonStr $grain) + ";" + [Environment]::NewLine
$js += "window.DASH.sales=" + (JsonStr $salesList) + ";" + [Environment]::NewLine

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($OutFile, $js, $utf8NoBom)
Write-Host ("OK -> {0} ({1:n0} bytes) | dias={2} grain={3} vendas={4}" -f $OutFile, (Get-Item $OutFile).Length, $daily.Count, $grain.Count, $totVendas)
