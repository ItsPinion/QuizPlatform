import type { Difficulty, QuizStatus } from '@quiz/shared';

export interface QuestionSeed {
  text: string;
  options: [string, string, string, string];
  /** Index (0–3) of the correct option. */
  correct: number;
  explanation: string;
  marks?: number;
  difficulty?: Difficulty;
}

export interface QuizSeed {
  title: string;
  slug: string;
  description: string;
  category: string;
  difficulty: Difficulty;
  durationMinutes: number;
  passingScore: number;
  maxAttempts: number;
  status: QuizStatus;
  /** Marks removed per wrong answer. Omitted means no penalty. */
  negativeMarks?: number;
  /** Deal the questions in a fresh order for every attempt. */
  shuffleQuestions?: boolean;
  /** Deal each question's options in a fresh order. */
  shuffleOptions?: boolean;
  /** Whether a pass hands out a certificate. Omitted means yes. */
  certificateEnabled?: boolean;
  /** Relative to seed time, in days: negative is in the past. */
  availableFromInDays?: number;
  availableUntilInDays?: number;
  questions: QuestionSeed[];
}

export interface CategorySeed {
  name: string;
  slug: string;
  description: string;
}

export const categorySeeds: CategorySeed[] = [
  { name: 'HTML', slug: 'html', description: 'Markup, semantics and document structure.' },
  { name: 'CSS', slug: 'css', description: 'Layout, typography and responsive styling.' },
  {
    name: 'JavaScript',
    slug: 'javascript',
    description: 'The language of the web: syntax, arrays, async.',
  },
  { name: 'React', slug: 'react', description: 'Components, hooks and state management.' },
  { name: 'Node.js', slug: 'nodejs', description: 'Server-side JavaScript and API design.' },
  { name: 'Python', slug: 'python', description: 'Core Python syntax and data structures.' },
  { name: 'Java', slug: 'java', description: 'Object-oriented programming with Java.' },
  { name: 'Database', slug: 'database', description: 'SQL, schema design and query optimisation.' },
  {
    name: 'Computer Networks',
    slug: 'computer-networks',
    description: 'Protocols, addressing and networking models.',
  },
  {
    name: 'Cyber Security',
    slug: 'cyber-security',
    description: 'Threats, defences and secure coding practices.',
  },
];

export const quizSeeds: QuizSeed[] = [
  {
    title: 'HTML Fundamentals',
    slug: 'html-fundamentals',
    description:
      'Test your knowledge of HTML tags, attributes and semantic document structure. Great warm-up for frontend interviews.',
    category: 'HTML',
    difficulty: 'EASY',
    durationMinutes: 15,
    passingScore: 60,
    maxAttempts: 3,
    status: 'PUBLISHED',
    shuffleOptions: true,
    questions: [
      {
        text: 'What does HTML stand for?',
        options: [
          'Hyper Tool Multi Language',
          'HyperText Markup Language',
          'High Text Machine Language',
          'Home Tool Markup Language',
        ],
        correct: 1,
        explanation:
          'HTML stands for HyperText Markup Language — it describes the structure of web documents.',
      },
      {
        text: 'Which element represents the largest heading on a page?',
        options: ['<heading>', '<h6>', '<h1>', '<header>'],
        correct: 2,
        explanation:
          '<h1> is the highest-level heading; <header> is a semantic landmark, not a heading.',
      },
      {
        text: 'Which attribute provides alternative text for an image?',
        options: ['title', 'alt', 'caption', 'aria-text'],
        correct: 1,
        explanation:
          'The alt attribute is announced by screen readers and shown when the image fails to load.',
      },
      {
        text: 'Which element is the correct semantic container for primary navigation links?',
        options: ['<div class="nav">', '<menu>', '<nav>', '<section>'],
        correct: 2,
        explanation: '<nav> is the semantic element for a block of major navigation links.',
      },
      {
        text: 'Which doctype declaration marks a document as HTML5?',
        options: [
          '<!DOCTYPE html>',
          '<!DOCTYPE html5>',
          '<?html version="5"?>',
          '<!DOCTYPE xhtml>',
        ],
        correct: 0,
        explanation: 'HTML5 uses the short, case-insensitive `<!DOCTYPE html>` declaration.',
      },
    ],
  },
  {
    title: 'CSS Essentials',
    slug: 'css-essentials',
    description:
      'Selectors, the box model, flexbox and responsive units. A quick check of everyday CSS knowledge.',
    category: 'CSS',
    difficulty: 'EASY',
    durationMinutes: 15,
    passingScore: 60,
    maxAttempts: 3,
    status: 'PUBLISHED',
    questions: [
      {
        text: 'Which property changes the colour of text?',
        options: ['font-color', 'text-color', 'color', 'foreground'],
        correct: 2,
        explanation: 'The `color` property sets the foreground (usually text) colour.',
      },
      {
        text: 'Which display value turns an element into a flex container?',
        options: ['block', 'flex', 'inline', 'grid-template'],
        correct: 1,
        explanation: '`display: flex` enables the flexible box layout model for its children.',
      },
      {
        text: 'Which selector targets elements with the class "card"?',
        options: ['#card', '.card', 'card', '*card'],
        correct: 1,
        explanation: 'A leading dot selects by class; a leading hash selects by id.',
      },
      {
        text: 'Which unit is relative to the root element font size?',
        options: ['em', 'px', 'rem', 'vh'],
        correct: 2,
        explanation:
          '`rem` is relative to the root font size, while `em` is relative to the current element.',
      },
      {
        text: 'Which property adds space inside an element, between content and border?',
        options: ['margin', 'padding', 'gap', 'outline'],
        correct: 1,
        explanation: 'Padding is inside the border; margin is outside it.',
      },
    ],
  },
  {
    title: 'JavaScript Fundamentals',
    slug: 'javascript-fundamentals',
    description:
      'Variables, arrays, equality and JSON handling — the core concepts every JavaScript developer should know.',
    category: 'JavaScript',
    difficulty: 'MEDIUM',
    durationMinutes: 20,
    passingScore: 60,
    maxAttempts: 2,
    status: 'PUBLISHED',
    // The one paper that punishes guessing, and the one that reshuffles.
    negativeMarks: 0.25,
    shuffleQuestions: true,
    questions: [
      {
        text: 'Which keyword declares a block-scoped constant?',
        options: ['var', 'let', 'const', 'static'],
        correct: 2,
        explanation: '`const` creates a block-scoped binding that cannot be reassigned.',
      },
      {
        text: 'Which method converts a JSON string into a JavaScript object?',
        options: ['JSON.stringify()', 'JSON.parse()', 'JSON.convert()', 'JSON.object()'],
        correct: 1,
        explanation: 'JSON.parse() converts a JSON string into a JavaScript object.',
      },
      {
        text: 'Which array method adds an element to the end of an array?',
        options: ['unshift()', 'push()', 'pop()', 'shift()'],
        correct: 1,
        explanation: 'push() appends items; pop() removes from the end.',
      },
      {
        text: 'What does `typeof null` evaluate to?',
        options: ['"null"', '"undefined"', '"object"', '"boolean"'],
        correct: 2,
        explanation: 'A long-standing JavaScript quirk: `typeof null` is "object".',
      },
      {
        text: 'Which operator compares both value and type?',
        options: ['==', '=', '===', '!='],
        correct: 2,
        explanation: 'Strict equality `===` performs no type coercion.',
      },
      {
        text: 'What does Array.prototype.map() return?',
        options: [
          'The original array, mutated',
          'A new array with the same length',
          'A single accumulated value',
          'undefined',
        ],
        correct: 1,
        explanation:
          'map() returns a new array of the same length, containing the callback results.',
        marks: 2,
      },
    ],
  },
  {
    title: 'React Basics',
    slug: 'react-basics',
    description:
      'Components, props, hooks and list rendering. Covers the fundamentals of building UI with React.',
    category: 'React',
    difficulty: 'MEDIUM',
    durationMinutes: 20,
    passingScore: 65,
    maxAttempts: 2,
    status: 'PUBLISHED',
    questions: [
      {
        text: 'Which hook manages local component state?',
        options: ['useEffect', 'useState', 'useMemo', 'useContext'],
        correct: 1,
        explanation: 'useState returns the current value and a setter that triggers a re-render.',
      },
      {
        text: 'How is data passed from a parent component to a child?',
        options: ['Via state', 'Via props', 'Via context only', 'Via global variables'],
        correct: 1,
        explanation: 'Props are read-only inputs passed down the component tree.',
      },
      {
        text: 'Which hook is used for side effects after render?',
        options: ['useState', 'useRef', 'useEffect', 'useReducer'],
        correct: 2,
        explanation: 'useEffect runs after paint and can clean up on unmount.',
      },
      {
        text: 'Why are stable `key` props required when rendering lists?',
        options: [
          'To style list items',
          'To sort the items',
          'To let React identify which items changed',
          'To make items clickable',
        ],
        correct: 2,
        explanation: 'Keys let React match elements between renders and preserve correct state.',
      },
      {
        text: 'What does “lifting state up” mean?',
        options: [
          'Storing state in localStorage',
          'Moving shared state to the closest common ancestor',
          'Moving state into a Redux store',
          'Converting state into props permanently',
        ],
        correct: 1,
        explanation: 'Shared state lives in the common parent and is passed down via props.',
      },
    ],
  },
  {
    title: 'Node.js & REST APIs',
    slug: 'nodejs-rest-apis',
    description: 'HTTP semantics, status codes and Node.js runtime basics for backend developers.',
    category: 'Node.js',
    difficulty: 'MEDIUM',
    durationMinutes: 25,
    passingScore: 60,
    maxAttempts: 2,
    status: 'PUBLISHED',
    questions: [
      {
        text: 'Which built-in module is used to create an HTTP server in Node.js?',
        options: ['node:net', 'node:http', 'node:server', 'node:express'],
        correct: 1,
        explanation: '`node:http` exposes createServer(); Express builds on top of it.',
      },
      {
        text: 'Which HTTP status code means a new resource was created?',
        options: ['200', '201', '204', '301'],
        correct: 1,
        explanation: '201 Created is returned after a successful POST that creates a resource.',
      },
      {
        text: 'Which HTTP method should replace a resource in an idempotent way?',
        options: ['POST', 'PATCH', 'PUT', 'CONNECT'],
        correct: 2,
        explanation: 'PUT replaces the resource representation and is idempotent.',
      },
      {
        text: 'Which package.json field lists dependencies needed at runtime?',
        options: ['devDependencies', 'peerDependencies', 'dependencies', 'optionalDependencies'],
        correct: 2,
        explanation: '`dependencies` are installed in production; devDependencies are for tooling.',
      },
      {
        text: 'Which status code indicates the request lacks valid authentication credentials?',
        options: ['400', '401', '403', '404'],
        correct: 1,
        explanation:
          '401 Unauthorized means authentication is missing or invalid; 403 means forbidden.',
      },
    ],
  },
  {
    title: 'Python Programming',
    slug: 'python-programming',
    description:
      'Python syntax, data types and control flow — ideal for beginners checking their foundations.',
    category: 'Python',
    difficulty: 'EASY',
    durationMinutes: 20,
    passingScore: 60,
    maxAttempts: 3,
    status: 'PUBLISHED',
    questions: [
      {
        text: 'Which keyword defines a function in Python?',
        options: ['func', 'def', 'function', 'lambda'],
        correct: 1,
        explanation: '`def` starts a function definition; `lambda` creates an anonymous one.',
      },
      {
        text: 'Which built-in data type is immutable?',
        options: ['list', 'dict', 'tuple', 'set'],
        correct: 2,
        explanation: 'Tuples cannot be changed after creation, unlike lists, dicts and sets.',
      },
      {
        text: 'What does len([1, 2, 3]) return?',
        options: ['2', '3', '4', 'An error'],
        correct: 1,
        explanation: 'len() returns the number of items in the sequence: 3.',
      },
      {
        text: 'Which operator performs floor division?',
        options: ['/', '//', '%', '**'],
        correct: 1,
        explanation: '`//` divides and rounds down; `/` returns a float.',
      },
      {
        text: 'Which statement pair handles exceptions?',
        options: ['try / except', 'catch / throw', 'begin / rescue', 'do / catch'],
        correct: 0,
        explanation: 'Python uses try/except (optionally else/finally).',
      },
    ],
  },
  {
    title: 'SQL & Databases',
    slug: 'sql-databases',
    description:
      'Filtering, joins, keys and aggregates. A practical check of relational database fundamentals.',
    category: 'Database',
    difficulty: 'MEDIUM',
    durationMinutes: 20,
    passingScore: 60,
    maxAttempts: 2,
    status: 'PUBLISHED',
    questions: [
      {
        text: 'Which clause filters rows in a SELECT statement?',
        options: ['HAVING', 'WHERE', 'ORDER BY', 'GROUP BY'],
        correct: 1,
        explanation: 'WHERE filters rows before grouping; HAVING filters groups.',
      },
      {
        text: 'Which join returns only rows with matches in both tables?',
        options: ['LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL OUTER JOIN'],
        correct: 2,
        explanation: 'INNER JOIN keeps only matching pairs.',
      },
      {
        text: 'What is the role of a primary key?',
        options: [
          'It encrypts the table',
          'It uniquely identifies each row',
          'It creates a foreign key automatically',
          'It sorts the table physically',
        ],
        correct: 1,
        explanation: 'A primary key is a unique, non-null identifier for a row.',
      },
      {
        text: 'Which statement inserts new rows?',
        options: ['UPDATE', 'MERGE', 'INSERT INTO', 'ALTER TABLE'],
        correct: 2,
        explanation: 'INSERT INTO appends rows to a table.',
      },
      {
        text: 'What do database indexes primarily improve?',
        options: ['Read performance', 'Write performance', 'Storage size', 'Backup speed'],
        correct: 0,
        explanation: 'Indexes speed up lookups at the cost of extra storage and slower writes.',
        marks: 2,
      },
    ],
  },
  {
    title: 'Cyber Security Basics',
    slug: 'cyber-security-basics',
    description:
      'Common web threats and defensive practices. Passing this quiz requires a strong score.',
    category: 'Cyber Security',
    difficulty: 'HARD',
    durationMinutes: 25,
    passingScore: 70,
    maxAttempts: 1,
    status: 'PUBLISHED',
    // Published, but not open yet: the catalogue shows the door rather than
    // hiding the room, and the API refuses to start it.
    availableFromInDays: 3,
    // A hard paper that punishes guessing.
    negativeMarks: 0.5,
    questions: [
      {
        text: 'Which attack injects malicious SQL through unsanitised user input?',
        options: ['SQL injection', 'Cross-site request forgery', 'Clickjacking', 'DNS spoofing'],
        correct: 0,
        explanation: 'Parameterised queries are the primary defence against SQL injection.',
      },
      {
        text: 'How does hashing differ from encryption?',
        options: [
          'Hashing is reversible',
          'Hashing is one-way',
          'Hashing uses a public key',
          'They are identical',
        ],
        correct: 1,
        explanation:
          'Hashing is a one-way function; passwords should never be encrypted, only hashed.',
      },
      {
        text: 'Which HTTP response header helps mitigate cross-site scripting?',
        options: ['Content-Security-Policy', 'Cache-Control', 'Accept-Encoding', 'ETag'],
        correct: 0,
        explanation: 'CSP restricts which scripts may execute, reducing XSS impact.',
        marks: 2,
      },
      {
        text: 'What is phishing?',
        options: [
          'A network scan',
          'A social engineering attack',
          'A database exploit',
          'A denial-of-service attack',
        ],
        correct: 1,
        explanation: 'Phishing tricks people into revealing credentials or installing malware.',
      },
      {
        text: 'Which practice best protects stored passwords?',
        options: [
          'Reversible encryption',
          'Plain text with file permissions',
          'Salted, slow hashing',
          'Base64 encoding',
        ],
        correct: 2,
        explanation: 'Salted, memory-hard hashes make offline brute-force attacks expensive.',
      },
    ],
  },
  {
    title: 'Java OOP Concepts',
    slug: 'java-oop-concepts',
    description:
      'Inheritance, interfaces and encapsulation in Java. Currently a draft — visible to admins only.',
    category: 'Java',
    difficulty: 'HARD',
    durationMinutes: 30,
    passingScore: 70,
    maxAttempts: 1,
    status: 'DRAFT',
    questions: [
      {
        text: 'Which keyword allows a class to inherit from another class?',
        options: ['implements', 'extends', 'inherits', 'super'],
        correct: 1,
        explanation: 'Classes extend classes; interfaces are implemented.',
      },
      {
        text: 'What is encapsulation?',
        options: [
          'Hiding internal state behind controlled access',
          'Creating multiple constructors',
          'Overriding methods',
          'Converting types at runtime',
        ],
        correct: 0,
        explanation:
          'Private fields plus public getters/setters are the usual form of encapsulation.',
      },
      {
        text: 'Which method is the entry point of a Java application?',
        options: ['start()', 'main()', 'run()', 'init()'],
        correct: 1,
        explanation: '`public static void main(String[] args)` is the JVM entry point.',
      },
    ],
  },
  {
    title: 'Computer Networks',
    slug: 'computer-networks',
    description:
      'TCP/IP layers, addressing and common protocols. Unpublished while questions are being reviewed.',
    category: 'Computer Networks',
    difficulty: 'MEDIUM',
    durationMinutes: 25,
    passingScore: 60,
    maxAttempts: 2,
    status: 'UNPUBLISHED',
    questions: [
      {
        text: 'Which layer of the OSI model routes packets between networks?',
        options: ['Data link', 'Network', 'Transport', 'Session'],
        correct: 1,
        explanation: 'Layer 3 (network) uses IP addresses to route packets.',
      },
      {
        text: 'Which protocol provides reliable, ordered delivery?',
        options: ['UDP', 'TCP', 'ICMP', 'ARP'],
        correct: 1,
        explanation: 'TCP adds sequencing, acknowledgements and retransmission.',
      },
      {
        text: 'What does DNS do?',
        options: [
          'Assigns MAC addresses',
          'Resolves domain names to IP addresses',
          'Encrypts web traffic',
          'Compresses HTTP responses',
        ],
        correct: 1,
        explanation: 'DNS is the domain name system: names to IPs.',
      },
    ],
  },
];
