/**
 * Country name → IOC 3-letter code.
 *
 * Onboarding collects a human country name ("Colombia"); the leaderboard's
 * identity (§4.4) requires the IOC code ("COL"). This maps every name the
 * app's onboarding list can produce. Names without an IOC code (e.g.
 * Vatican City) map to nothing — the athlete simply has no country code
 * until they pick a recognized one.
 *
 * NOTE: IOC codes are NOT ISO 3166 alpha-3 (Germany GER not DEU,
 * Netherlands NED not NLD, Switzerland SUI not CHE, ...).
 */
const NAME_TO_IOC = {
  'afghanistan': 'AFG', 'albania': 'ALB', 'algeria': 'ALG', 'andorra': 'AND',
  'angola': 'ANG', 'antigua and barbuda': 'ANT', 'argentina': 'ARG',
  'armenia': 'ARM', 'australia': 'AUS', 'austria': 'AUT', 'azerbaijan': 'AZE',
  'bahamas': 'BAH', 'bahrain': 'BRN', 'bangladesh': 'BAN', 'barbados': 'BAR',
  'belarus': 'BLR', 'belgium': 'BEL', 'belize': 'BIZ', 'benin': 'BEN',
  'bhutan': 'BHU', 'bolivia': 'BOL', 'bosnia and herzegovina': 'BIH',
  'botswana': 'BOT', 'brazil': 'BRA', 'brunei': 'BRU', 'bulgaria': 'BUL',
  'burkina faso': 'BUR', 'burundi': 'BDI', 'cabo verde': 'CPV',
  'cambodia': 'CAM', 'cameroon': 'CMR', 'canada': 'CAN',
  'central african republic': 'CAF', 'chad': 'CHA', 'chile': 'CHI',
  'china': 'CHN', 'colombia': 'COL', 'comoros': 'COM', 'congo': 'CGO',
  'costa rica': 'CRC', 'croatia': 'CRO', 'cuba': 'CUB', 'cyprus': 'CYP',
  'czech republic': 'CZE', 'czechia': 'CZE', 'denmark': 'DEN',
  'djibouti': 'DJI', 'dominica': 'DMA', 'dominican republic': 'DOM',
  'ecuador': 'ECU', 'egypt': 'EGY', 'el salvador': 'ESA',
  'equatorial guinea': 'GEQ', 'eritrea': 'ERI', 'estonia': 'EST',
  'eswatini': 'SWZ', 'ethiopia': 'ETH', 'fiji': 'FIJ', 'finland': 'FIN',
  'france': 'FRA', 'gabon': 'GAB', 'gambia': 'GAM', 'georgia': 'GEO',
  'germany': 'GER', 'ghana': 'GHA', 'greece': 'GRE', 'grenada': 'GRN',
  'guatemala': 'GUA', 'guinea': 'GUI', 'guinea-bissau': 'GBS',
  'guyana': 'GUY', 'haiti': 'HAI', 'honduras': 'HON', 'hungary': 'HUN',
  'iceland': 'ISL', 'india': 'IND', 'indonesia': 'INA', 'iran': 'IRI',
  'iraq': 'IRQ', 'ireland': 'IRL', 'israel': 'ISR', 'italy': 'ITA',
  'jamaica': 'JAM', 'japan': 'JPN', 'jordan': 'JOR', 'kazakhstan': 'KAZ',
  'kenya': 'KEN', 'kiribati': 'KIR', 'kosovo': 'KOS', 'kuwait': 'KUW',
  'kyrgyzstan': 'KGZ', 'laos': 'LAO', 'latvia': 'LAT', 'lebanon': 'LBN',
  'lesotho': 'LES', 'liberia': 'LBR', 'libya': 'LBA', 'liechtenstein': 'LIE',
  'lithuania': 'LTU', 'luxembourg': 'LUX', 'madagascar': 'MAD',
  'malawi': 'MAW', 'malaysia': 'MAS', 'maldives': 'MDV', 'mali': 'MLI',
  'malta': 'MLT', 'marshall islands': 'MHL', 'mauritania': 'MTN',
  'mauritius': 'MRI', 'mexico': 'MEX', 'micronesia': 'FSM',
  'moldova': 'MDA', 'monaco': 'MON', 'mongolia': 'MGL', 'montenegro': 'MNE',
  'morocco': 'MAR', 'mozambique': 'MOZ', 'myanmar': 'MYA', 'namibia': 'NAM',
  'nauru': 'NRU', 'nepal': 'NEP', 'netherlands': 'NED', 'new zealand': 'NZL',
  'nicaragua': 'NCA', 'niger': 'NIG', 'nigeria': 'NGR',
  'north korea': 'PRK', 'north macedonia': 'MKD', 'norway': 'NOR',
  'oman': 'OMA', 'pakistan': 'PAK', 'palau': 'PLW', 'palestine': 'PLE',
  'panama': 'PAN', 'papua new guinea': 'PNG', 'paraguay': 'PAR',
  'peru': 'PER', 'philippines': 'PHI', 'poland': 'POL', 'portugal': 'POR',
  'puerto rico': 'PUR', 'qatar': 'QAT', 'romania': 'ROU', 'russia': 'RUS',
  'rwanda': 'RWA', 'saint kitts and nevis': 'SKN', 'saint lucia': 'LCA',
  'saint vincent and the grenadines': 'VIN', 'samoa': 'SAM',
  'san marino': 'SMR', 'sao tome and principe': 'STP',
  'saudi arabia': 'KSA', 'senegal': 'SEN', 'serbia': 'SRB',
  'seychelles': 'SEY', 'sierra leone': 'SLE', 'singapore': 'SGP',
  'slovakia': 'SVK', 'slovenia': 'SLO', 'solomon islands': 'SOL',
  'somalia': 'SOM', 'south africa': 'RSA', 'south korea': 'KOR',
  'south sudan': 'SSD', 'spain': 'ESP', 'sri lanka': 'SRI', 'sudan': 'SUD',
  'suriname': 'SUR', 'sweden': 'SWE', 'switzerland': 'SUI', 'syria': 'SYR',
  'taiwan': 'TPE', 'tajikistan': 'TJK', 'tanzania': 'TAN', 'thailand': 'THA',
  'timor-leste': 'TLS', 'togo': 'TOG', 'tonga': 'TGA',
  'trinidad and tobago': 'TTO', 'tunisia': 'TUN', 'turkey': 'TUR',
  'turkmenistan': 'TKM', 'tuvalu': 'TUV', 'uganda': 'UGA', 'ukraine': 'UKR',
  'united arab emirates': 'UAE', 'united kingdom': 'GBR',
  'united states': 'USA', 'uruguay': 'URU', 'uzbekistan': 'UZB',
  'vanuatu': 'VAN', 'venezuela': 'VEN', 'vietnam': 'VIE', 'yemen': 'YEM',
  'zambia': 'ZAM', 'zimbabwe': 'ZIM',
};

/**
 * Return the IOC code for a country name (case/space-insensitive), or null.
 * Already-IOC input (3 uppercase letters that appear as a value) passes through.
 */
function iocCodeForCountry(name) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (/^[A-Z]{3}$/.test(trimmed) && Object.values(NAME_TO_IOC).includes(trimmed)) {
    return trimmed;
  }
  return NAME_TO_IOC[trimmed.toLowerCase()] ?? null;
}

module.exports = { iocCodeForCountry, NAME_TO_IOC };
