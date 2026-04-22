import path from 'node:path';

export const ROOT = '/Users/michalmatlosz/Language_dungeon';
export const EXPERIMENTAL_DIR = path.join(ROOT, 'src/data/experimental');
export const SNAPSHOT_DIR = path.join(EXPERIMENTAL_DIR, 'source_snapshot');
export const MASTER_DIR = path.join(EXPERIMENTAL_DIR, 'master');
export const TIERED_DIR = path.join(EXPERIMENTAL_DIR, 'tiered');
export const CEFR_DIR = path.join(EXPERIMENTAL_DIR, 'cefr');

export const CATEGORY_IDS = [
  'household',
  'school',
  'food_kitchen',
  'animals_nature',
  'town_places',
  'fantasy_adventure',
];

export const CEFR_BY_TIER = {
  1: 'a1',
  2: 'a2',
  3: 'b1',
};

function bucket(lines) {
  return lines
    .trim()
    .split('\n')
    .map((line) => {
      const [en, pl] = line.split('|').map((part) => part.trim());
      return { en, pl };
    });
}

export function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const CATEGORY_CONTEXTS = {
  household: {
    frames: [
      { en: 'in the house', pl: 'w domu', key: 'house' },
      { en: 'in the room', pl: 'w pokoju', key: 'room' },
      { en: 'in the kitchen', pl: 'w kuchni', key: 'kitchen' },
      { en: 'in the bathroom', pl: 'w łazience', key: 'bathroom' },
      { en: 'in the bedroom', pl: 'w sypialni', key: 'bedroom' },
      { en: 'on the shelf', pl: 'na półce', key: 'shelf' },
      { en: 'near the window', pl: 'przy oknie', key: 'window' },
      { en: 'on the floor', pl: 'na podłodze', key: 'floor' },
      { en: 'by the door', pl: 'przy drzwiach', key: 'door' },
      { en: 'in the garden', pl: 'w ogrodzie', key: 'garden' },
      { en: 'in the garage', pl: 'w garażu', key: 'garage' },
      { en: 'in the hallway', pl: 'w przedpokoju', key: 'hallway' },
    ],
  },
  school: {
    frames: [
      { en: 'in the school', pl: 'w szkole', key: 'school' },
      { en: 'in the classroom', pl: 'w klasie', key: 'classroom' },
      { en: 'in the library', pl: 'w bibliotece', key: 'library' },
      { en: 'on the desk', pl: 'na biurku', key: 'desk' },
      { en: 'in the backpack', pl: 'w plecaku', key: 'backpack' },
      { en: 'in the laboratory', pl: 'w laboratorium', key: 'laboratory' },
      { en: 'by the whiteboard', pl: 'przy tablicy', key: 'whiteboard' },
      { en: 'on the page', pl: 'na stronie', key: 'page' },
      { en: 'on the screen', pl: 'na ekranie', key: 'screen' },
      { en: 'in the auditorium', pl: 'w auli', key: 'auditorium' },
      { en: 'on the campus', pl: 'na kampusie', key: 'campus' },
      { en: 'in the workshop', pl: 'na warsztacie', key: 'workshop' },
    ],
  },
  food_kitchen: {
    frames: [
      { en: 'in the kitchen', pl: 'w kuchni', key: 'kitchen' },
      { en: 'in the fridge', pl: 'w lodówce', key: 'fridge' },
      { en: 'on the plate', pl: 'na talerzu', key: 'plate' },
      { en: 'in the bowl', pl: 'w misce', key: 'bowl' },
      { en: 'on the table', pl: 'na stole', key: 'table' },
      { en: 'in the bakery', pl: 'w piekarni', key: 'bakery' },
      { en: 'in the cafeteria', pl: 'w stołówce', key: 'cafeteria' },
      { en: 'at the buffet', pl: 'przy bufecie', key: 'buffet' },
      { en: 'on the tray', pl: 'na tacy', key: 'tray' },
      { en: 'in the saucepan', pl: 'w rondlu', key: 'saucepan' },
      { en: 'in the picnic basket', pl: 'w koszu piknikowym', key: 'basket' },
      { en: 'by the blender', pl: 'przy blenderze', key: 'blender' },
    ],
  },
  animals_nature: {
    frames: [
      { en: 'in the forest', pl: 'w lesie', key: 'forest' },
      { en: 'in the meadow', pl: 'na łące', key: 'meadow' },
      { en: 'by the river', pl: 'nad rzeką', key: 'river' },
      { en: 'by the lake', pl: 'nad jeziorem', key: 'lake' },
      { en: 'in the sky', pl: 'na niebie', key: 'sky' },
      { en: 'in the nest', pl: 'w gnieździe', key: 'nest' },
      { en: 'in the cave', pl: 'w jaskini', key: 'cave' },
      { en: 'on the island', pl: 'na wyspie', key: 'island' },
      { en: 'by the pond', pl: 'przy stawie', key: 'pond' },
      { en: 'in the orchard', pl: 'w sadzie', key: 'orchard' },
      { en: 'in the valley', pl: 'w dolinie', key: 'valley' },
      { en: 'on the coast', pl: 'na wybrzeżu', key: 'coast' },
    ],
  },
  town_places: {
    frames: [
      { en: 'in the town', pl: 'w mieście', key: 'town' },
      { en: 'on the street', pl: 'na ulicy', key: 'street' },
      { en: 'in the park', pl: 'w parku', key: 'park' },
      { en: 'at the station', pl: 'na stacji', key: 'station' },
      { en: 'by the bridge', pl: 'przy moście', key: 'bridge' },
      { en: 'in the museum', pl: 'w muzeum', key: 'museum' },
      { en: 'in the square', pl: 'na placu', key: 'square' },
      { en: 'at the terminal', pl: 'na terminalu', key: 'terminal' },
      { en: 'in the tunnel', pl: 'w tunelu', key: 'tunnel' },
      { en: 'at the dock', pl: 'na nabrzeżu', key: 'dock' },
      { en: 'in the market', pl: 'na rynku', key: 'market' },
      { en: 'in the hotel', pl: 'w hotelu', key: 'hotel' },
    ],
  },
  fantasy_adventure: {
    frames: [
      { en: 'in the castle', pl: 'w zamku', key: 'castle' },
      { en: 'in the tower', pl: 'w wieży', key: 'tower' },
      { en: 'in the dungeon', pl: 'w lochu', key: 'dungeon' },
      { en: 'in the chamber', pl: 'w komnacie', key: 'chamber' },
      { en: 'in the cavern', pl: 'w grocie', key: 'cavern' },
      { en: 'at the gateway', pl: 'przy bramie', key: 'gateway' },
      { en: 'in the watchtower', pl: 'w wieży strażniczej', key: 'watchtower' },
      { en: 'in the camp', pl: 'w obozie', key: 'camp' },
      { en: 'by the altar', pl: 'przy ołtarzu', key: 'altar' },
      { en: 'on the battlefield', pl: 'na polu bitwy', key: 'battlefield' },
      { en: 'in the stronghold', pl: 'w warowni', key: 'stronghold' },
      { en: 'by the lantern', pl: 'przy latarni', key: 'lantern' },
    ],
  },
};

export const VOCAB_BANKS = {
  household: {
    1: bucket(`
      house|dom
      room|pokój
      living room|salon
      bathroom|łazienka
      bedroom|sypialnia
      bed|łóżko
      table|stół
      chair|krzesło
      door|drzwi
      window|okno
      lamp|lampa
      clock|zegar
      sofa|sofa
      cupboard|kredens
      mirror|lustro
      towel|ręcznik
      brush|szczotka
      soap|mydło
      pillow|poduszka
      blanket|koc
      toy|zabawka
      shelf|półka
      floor|podłoga
      wall|ściana
      roof|dach
      garden|ogród
      garage|garaż
      key|klucz
      mom|mama
      dad|tata
      brother|brat
      sister|siostra
      grandma|babcia
      grandpa|dziadek
      family|rodzina
    `),
    2: bucket(`
      apartment|mieszkanie
      balcony|balkon
      staircase|klatka schodowa
      carpet|dywan
      curtain|zasłona
      basket|koszyk
      drawer|szuflada
      vacuum|odkurzacz
      dishwasher|zmywarka
      freezer|zamrażarka
      oven|piekarnik
      microwave|mikrofalówka
      sink|zlew
      faucet|kran
      mop|mop
      broom|miotła
      hanger|wieszak
      doormat|wycieraczka
      corridor|korytarz
      attic|strych
      basement|piwnica
      chimney|komin
      gate|brama
      mailbox|skrzynka pocztowa
      candle|świeca
      apron|fartuch
      needle|igła
      thread|nić
      bucket|wiadro
      ladder|drabina
      parent|rodzic
      cousin|kuzyn
      uncle|wujek
      aunt|ciocia
      neighbour|sąsiad
    `),
    3: bucket(`
      pantry|spiżarnia
      radiator|grzejnik
      extension cable|przedłużacz
      socket|gniazdko
      switch|włącznik
      detergent|detergent
      wardrobe|szafa
      toolbox|skrzynka z narzędziami
      battery|bateria
      charger|ładowarka
      remote|pilot
      earphone|słuchawka
      doorstep|próg
      hallway|przedpokój
      guest room|pokój gościnny
      boiler|piec
      cushion|poduszka dekoracyjna
      sideboard|komoda
      keychain|brelok
      towel rack|wieszak na ręczniki
      laundry room|pralnia
      appliance|urządzenie
      furniture|meble
      mattress|materac
      pillowcase|poszewka
      bedsheet|prześcieradło
      bin|pojemnik
      recycling box|pojemnik do recyklingu
      receipt|paragon
      shopping list|lista zakupów
      electricity|prąd
      plumbing|hydraulika
      storage|schowek
      maintenance|konserwacja
      renovation|remont
    `),
  },
  school: {
    1: bucket(`
      school|szkoła
      classroom|klasa
      library|biblioteka
      book|książka
      notebook|zeszyt
      pencil|ołówek
      pen|długopis
      eraser|gumka
      ruler|linijka
      desk|ławka
      board|tablica
      bell|dzwonek
      lunchbox|śniadaniówka
      computer|komputer
      backpack|plecak
      map|mapa
      glue|klej
      crayon|kredka
      marker|marker
      sharpener|temperówka
      alphabet|alfabet
      number|liczba
      song|piosenka
      game|gra
      lesson|lekcja
      homework|praca domowa
      test|test
      question|pytanie
      answer|odpowiedź
      page|strona
      paper|papier
      teacher|nauczyciel
      student|uczeń
      friend|przyjaciel
      break|przerwa
    `),
    2: bucket(`
      laboratory|laboratorium
      dictionary|słownik
      sentence|zdanie
      paragraph|akapit
      exercise|ćwiczenie
      quiz|quiz
      calculator|kalkulator
      keyboard|klawiatura
      printer|drukarka
      screen|ekran
      poster|plakat
      timetable|plan lekcji
      workbook|ćwiczeniówka
      worksheet|karta pracy
      speaker|głośnik
      microphone|mikrofon
      tablet|tablet
      locker|szafka szkolna
      uniform|mundurek
      archive|archiwum
      subject|przedmiot
      science|nauka
      history|historia
      geography|geografia
      project|projekt
      team|zespół
      presentation|prezentacja
      schedule|harmonogram
      grade|ocena
      pronunciation|wymowa
      spelling|pisownia
      grammar|gramatyka
      trip|wyjazd szkolny
      certificate|certyfikat
      debate|debata
    `),
    3: bucket(`
      experiment|eksperyment
      microscope|mikroskop
      trophy|puchar
      workshop|warsztat
      competition|konkurs
      scholarship|stypendium
      whiteboard|tablica suchościeralna
      projector|projektor
      campus|kampus
      seminar|seminarium
      auditorium|aula
      notepad|notatnik
      staff room|pokój nauczycielski
      badge|identyfikator
      transcript|świadectwo
      syllabus|sylabus
      journal|czasopismo
      article|artykuł
      report|raport
      graph|wykres
      formula|wzór
      theorem|twierdzenie
      assignment|zadanie
      deadline|termin
      essay|esej
      headmaster|dyrektor
      counsellor|doradca
      curriculum|program nauczania
      research|badania
      source|źródło
      conclusion|wniosek
      portfolio|portfolio
      semester|semestr
      internship|praktyki
      criteria|kryteria
    `),
  },
  food_kitchen: {
    1: bucket(`
      kitchen|kuchnia
      fridge|lodówka
      plate|talerz
      cup|kubek
      spoon|łyżka
      fork|widelec
      knife|nóż
      bread|chleb
      butter|masło
      milk|mleko
      water|woda
      juice|sok
      apple|jabłko
      banana|banan
      orange|pomarańcza
      pear|gruszka
      strawberry|truskawka
      soup|zupa
      salad|sałatka
      cheese|ser
      egg|jajko
      chicken|kurczak
      fish|ryba
      rice|ryż
      potato|ziemniak
      tomato|pomidor
      carrot|marchewka
      cucumber|ogórek
      cake|ciasto
      cookie|ciastko
      sandwich|kanapka
      breakfast|śniadanie
      lunch|obiad
      dinner|kolacja
      tea|herbata
    `),
    2: bucket(`
      bowl|miska
      pan|patelnia
      tray|taca
      chopping board|deska do krojenia
      kettle|czajnik
      bottle|butelka
      napkin|serwetka
      recipe|przepis
      menu|menu
      bakery|piekarnia
      pasta|makaron
      cereal|płatki
      pancake|naleśnik
      jam|dżem
      honey|miód
      pepper|pieprz
      salt|sól
      onion|cebula
      garlic|czosnek
      mushroom|grzyb
      lemonade|lemoniada
      yogurt|jogurt
      snack|przekąska
      dessert|deser
      lemon|cytryna
      grape|winogrono
      pineapple|ananas
      sausage|kiełbasa
      ham|szynka
      spinach|szpinak
      lettuce|sałata
      bean|fasola
      pea|groszek
      sauce|sos
      picnic|piknik
    `),
    3: bucket(`
      saucepan|rondel
      toaster|toster
      blender|blender
      colander|durszlak
      whisk|trzepaczka
      thermos|termos
      platter|półmisek
      slicer|krajalnica
      measuring cup|miarka
      grater|tarka
      buffet|bufet
      barbecue|grill
      cafeteria|stołówka
      takeaway|jedzenie na wynos
      reservation|rezerwacja
      cupcake|babeczka
      pudding|budyń
      omelette|omlet
      broccoli|brokuł
      cauliflower|kalafior
      zucchini|cukinia
      pumpkin|dynia
      blueberry|borówka
      raspberry|malina
      coconut|kokos
      avocado|awokado
      ingredient|składnik
      portion|porcja
      vitamin|witamina
      protein|białko
      grain|zboże
      seafood|owoce morza
      stew|gulasz
      flavour|smak
      picnic basket|kosz piknikowy
    `),
  },
  animals_nature: {
    1: bucket(`
      forest|las
      meadow|łąka
      river|rzeka
      lake|jezioro
      sky|niebo
      cloud|chmura
      tree|drzewo
      flower|kwiat
      grass|trawa
      leaf|liść
      nest|gniazdo
      stone|kamień
      cat|kot
      dog|pies
      bird|ptak
      rabbit|królik
      mouse|mysz
      horse|koń
      cow|krowa
      pig|świnia
      sheep|owca
      duck|kaczka
      frog|żaba
      bee|pszczoła
      butterfly|motyl
      spider|pająk
      sun|słońce
      moon|księżyc
      star|gwiazda
      rain|deszcz
      snow|śnieg
      wind|wiatr
      mountain|góra
      field|pole
      goldfish|złota rybka
    `),
    2: bucket(`
      ocean|ocean
      island|wyspa
      desert|pustynia
      jungle|dżungla
      path|ścieżka
      cave|jaskinia
      waterfall|wodospad
      rainbow|tęcza
      storm|burza
      thunder|grzmot
      lightning|błyskawica
      branch|gałąź
      bush|krzak
      root|korzeń
      seed|nasiono
      petal|płatek
      fox|lis
      wolf|wilk
      deer|jeleń
      owl|sowa
      squirrel|wiewiórka
      hedgehog|jeż
      turtle|żółw
      dolphin|delfin
      whale|wieloryb
      parrot|papuga
      farmer|rolnik
      gardener|ogrodnik
      campfire|ognisko
      feather|pióro
      season|pora roku
      spring|wiosna
      summer|lato
      autumn|jesień
      winter|zima
    `),
    3: bucket(`
      valley|dolina
      cliff|klif
      stream|strumień
      pond|staw
      orchard|sad
      coast|wybrzeże
      reef|rafa
      canyon|kanion
      glacier|lodowiec
      volcano|wulkan
      habitat|siedlisko
      ecosystem|ekosystem
      climate|klimat
      environment|środowisko
      trail|szlak
      shell|muszla
      paw|łapa
      hoof|kopyto
      beak|dziób
      fur|futro
      migration|migracja
      wilderness|dzicz
      sunrise|wschód słońca
      sunset|zachód słońca
      breeze|bryza
      flood|powódź
      drought|susza
      blossom|kwiatostan
      harvest|zbiory
      telescope|teleskop
      creature|stworzenie
      litter|śmieci
      rescue|ratunek
      whiskers|wąsy
      creek|potok
    `),
  },
  town_places: {
    1: bucket(`
      town|miasto
      street|ulica
      road|droga
      bridge|most
      station|stacja
      shop|sklep
      market|rynek
      park|park
      playground|plac zabaw
      hospital|szpital
      pharmacy|apteka
      clinic|klinika
      cinema|kino
      museum|muzeum
      zoo|zoo
      post office|poczta
      bank|bank
      hotel|hotel
      restaurant|restauracja
      cafe|kawiarnia
      square|plac
      church|kościół
      ticket|bilet
      corner|róg
      pavement|chodnik
      fountain|fontanna
      statue|posąg
      bus|autobus
      car|samochód
      bike|rower
      train|pociąg
      stop|przystanek
      police|policja
      taxi|taksówka
      traffic light|sygnalizacja świetlna
    `),
    2: bucket(`
      airport|lotnisko
      platform|peron
      theatre|teatr
      swimming pool|basen
      office|biuro
      factory|fabryka
      harbour|port
      tower|wieża
      stadium|stadion
      flower shop|kwiaciarnia
      butcher shop|sklep mięsny
      crossroads|rozstaje
      petrol station|stacja benzynowa
      tram|tramwaj
      elevator|winda
      monument|pomnik
      crosswalk|przejście dla pieszych
      bicycle lane|ścieżka rowerowa
      traffic jam|korek
      ambulance|karetka
      fire engine|wóz strażacki
      police car|radiowóz
      passenger|pasażer
      suitcase|walizka
      driver|kierowca
      queue|kolejka
      ticket booth|kasa biletowa
      newsstand|kiosk
      neighbourhood|okolica
      suburb|przedmieście
      journey|podróż
      tourist|turysta
      guide|przewodnik
      market stall|stoisko
      city hall|ratusz
    `),
    3: bucket(`
      boulevard|bulwar
      avenue|aleja
      district|dzielnica
      intersection|skrzyżowanie dróg
      exhibition|wystawa
      souvenir|pamiątka
      receptionist|recepcjonista
      luggage|bagaż
      announcement|ogłoszenie
      construction|budowa
      detour|objazd
      crowd|tłum
      subway|metro
      tunnel|tunel
      skyscraper|wieżowiec
      passage|pasaż
      tram line|linia tramwajowa
      departure|odjazd
      arrival|przyjazd
      excursion|wycieczka krajoznawcza
      parking lot|parking
      security|ochrona
      checkpoint|punkt kontroli
      barricade|barykada
      underpass|przejście podziemne
      ferry|prom
      dock|nabrzeże
      platform ticket|bilet peronowy
      destination|cel
      route|trasa
      landmark|punkt orientacyjny
      pedestrian|pieszy
      cyclist|rowerzysta
      commute|dojazd
      terminal|terminal
    `),
  },
  fantasy_adventure: {
    1: bucket(`
      castle|zamek
      dragon|smok
      sword|miecz
      shield|tarcza
      treasure|skarb
      crown|korona
      magic|magia
      spell|zaklęcie
      potion|eliksir
      monster|potwór
      hero|bohater
      torch|pochodnia
      scroll|zwój
      gem|klejnot
      orb|kula
      wand|różdżka
      cloak|peleryna
      knight|rycerz
      king|król
      queen|królowa
      prince|książę
      princess|księżniczka
      wizard|czarodziej
      throne|tron
      giant|olbrzym
      fairy|wróżka
      elf|elf
      dwarf|krasnolud
      quest|wyprawa
      portal|portal
      crystal|kryształ
      goblin|goblin
      rune|runa
      helmet|hełm
      armor|zbroja
    `),
    2: bucket(`
      dungeon|loch
      kingdom|królestwo
      banner|sztandar
      ring|pierścień
      amulet|amulet
      trident|trójząb
      cauldron|kocioł
      maze|labirynt
      carriage|powóz
      camp|obóz
      gate guard|strażnik bramy
      flame|płomień
      altar|ołtarz
      beast|bestia
      spear|włócznia
      dagger|sztylet
      mask|maska
      portal stone|kamień portalu
      archer|łucznik
      magic bird|magiczny ptak
      fire bird|ognisty ptak
      mermaid|syrena
      unicorn|jednorożec
      witch|czarownica
      villain|czarny charakter
      battle|bitwa
      escape|ucieczka
      guardian|strażnik
      shadow|cień
      secret|sekret
      curse|klątwa
      champion|mistrz
      puzzle|łamigłówka
      captain|kapitan
      messenger|posłaniec
    `),
    3: bucket(`
      fortress|twierdza
      spellbook|księga zaklęć
      compass|kompas
      artifact|artefakt
      archway|arkada
      cavern|grota
      watchtower|wieża strażnicza
      relic|relikwia
      parchment|pergamin
      chamber|komnata
      gateway|wrota
      helm|przyłbica
      gauntlet|rękawica zbrojna
      quiver|kołczan
      catapult|katapulta
      barracks|koszary
      stronghold|warownia
      crossbow|kusza
      lantern|latarnia
      riddle|zagadka
      companion|towarzysz
      prophecy|przepowiednia
      battlefield|pole bitwy
      oracle|wyrocznia
      commander|dowódca
      alliance|sojusz
      enemy|wróg
      traveler|podróżnik
      healer|uzdrowiciel
      pathfinder|tropiciel
      sorcerer|czarownik
      battleaxe|topór bojowy
      totem|totem
      adventure|przygoda
      spiral staircase|spiralne schody
    `),
  },
};
