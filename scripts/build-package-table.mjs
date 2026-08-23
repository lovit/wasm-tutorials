#!/usr/bin/env node
// Pyodide 락파일을 받아 docs/packages.md 를 만든다.
//
//   mise run docs:packages
//
// 손으로 적으면 다음 릴리스에 바로 낡는다. 수백 개를 눈으로 대조할 수도 없다.
// 결과는 커밋한다. 사이트 빌드가 네트워크에 매달리지 않게 하려는 것이다.

import { readFile, writeFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const OUT = join(ROOT, 'docs', 'packages.md');
const LOADER = join(ROOT, 'galleries', '_shared', 'pyodide.js');

// 분야는 락파일에 없다. 사람이 찾을 때 쓰는 말로 묶어 준다.
// 여기 없는 것은 "그 밖" 으로 간다. 목록에서 빠지지는 않는다.
const GROUPS = [
  {
    title: '데이터 다루기',
    names: ['numpy', 'pandas', 'polars', 'pyarrow', 'duckdb', 'xarray', 'zarr', 'sqlalchemy'],
  },
  {
    title: '그림 그리기',
    names: ['matplotlib', 'bokeh', 'altair', 'wordcloud'],
  },
  {
    title: '기계학습',
    names: ['scikit-learn', 'scipy', 'statsmodels', 'xgboost', 'lightgbm', 'sympy', 'networkx'],
  },
  {
    title: '이미지와 소리',
    names: ['pillow', 'scikit-image', 'opencv-python', 'imageio', 'soundfile', 'pygame-ce'],
  },
  {
    title: '웹과 네트워크',
    names: ['micropip', 'requests', 'httpx', 'pyodide-http', 'fastapi', 'pydantic', 'openai'],
  },
  {
    title: '글자 다루기',
    names: ['regex', 'nltk', 'pygments', 'tiktoken', 'beautifulsoup4', 'lxml'],
  },
];

/**
 * 예제가 쓰는 버전과 CDN 주소를 그대로 읽어 온다.
 *
 * 여기 다시 적으면 CDN 을 옮길 때 한쪽만 고치게 되고, 표는 옛 CDN 을 예제는 새 CDN 을 본다.
 * import 하지 않고 문자열로 읽는 것은 이 파일이 브라우저용 모듈이라 node 에서 부작용 없이
 * 불러온다는 보장이 없어서다.
 */
async function loaderConfig() {
  const source = await readFile(LOADER, 'utf8');
  const version = source.match(/PYODIDE_VERSION = '([^']+)'/)?.[1];
  const host = source.match(/https:\/\/[^`'"]*?\/pyodide\//)?.[0];
  if (!version || !host) {
    throw new Error('_shared/pyodide.js 에서 버전과 CDN 주소를 찾지 못했습니다');
  }
  return { version, indexUrl: `${host}v${version}/full/` };
}

function mib(bytes) {
  if (!bytes) return '—';
  const value = bytes / 1024 / 1024;
  return value < 1 ? `${Math.round(bytes / 1024)} KB` : `${value.toFixed(1)} MB`;
}

/**
 * wheel 크기를 잰다. 락파일에는 크기가 없어서 CDN 에 직접 물어봐야 한다.
 * 표에 싣는 것만 재고 나머지는 건너뛴다. 356개를 다 재면 너무 오래 걸린다.
 */
async function measure(baseUrl, fileName) {
  // 파일 이름에 경로가 섞이면 CDN 의 엉뚱한 곳을 때린다.
  if (!/^[A-Za-z0-9._+-]+\.whl$/.test(fileName ?? '')) return null;
  try {
    const response = await fetch(`${baseUrl}${fileName}`, { method: 'HEAD' });
    if (!response.ok) return null;
    return Number(response.headers.get('content-length')) || null;
  } catch {
    return null;
  }
}

/**
 * 동시에 너무 많이 물어보지 않는다. CDN 에 예의를 지킨다.
 *
 * 크기를 못 재면 표에 "—" 가 찍힌다. 몇 개쯤은 그럴 수 있지만 전부 그러면
 * 네트워크가 죽은 것이므로, 문서를 잘못 덮어쓰기 전에 멈춰야 한다.
 */
async function measureAll(baseUrl, entries, limit = 8) {
  const sizes = new Map();
  const failed = [];

  for (let i = 0; i < entries.length; i += limit) {
    const chunk = entries.slice(i, i + limit);
    const measured = await Promise.all(chunk.map(([, e]) => measure(baseUrl, e.file_name)));
    chunk.forEach(([name], index) => {
      sizes.set(name, measured[index]);
      if (measured[index] === null) failed.push(name);
    });
  }

  if (failed.length) {
    console.warn(`크기를 재지 못한 패키지 ${failed.length}개: ${failed.join(', ')}`);
  }
  if (entries.length && failed.length > entries.length / 2) {
    throw new Error(
      `${entries.length}개 중 ${failed.length}개의 크기를 재지 못했습니다. 크기 열이 비어 있는 문서를 만들지 않고 멈춥니다.`,
    );
  }

  return sizes;
}

// 원격에서 받은 값을 그대로 마크다운에 넣으면 표가 깨지거나 엉뚱한 링크가 된다.
// 락파일이 이상하면 조용히 넣지 말고 멈추는 편이 맞다.
const SAFE_NAME = /^[A-Za-z0-9._+-]+$/;

function checkValues(packages) {
  const odd = Object.entries(packages)
    .filter(([name, entry]) => !SAFE_NAME.test(name) || !SAFE_NAME.test(entry.version ?? ''))
    .map(([name]) => name);
  if (odd.length) {
    throw new Error(`락파일에 예상 밖의 이름이나 버전이 있습니다: ${odd.slice(0, 5).join(', ')}`);
  }
}

function sizedRow(name, entry, size) {
  const deps = entry.depends?.length ?? 0;
  return `| \`${name}\` | ${entry.version} | ${mib(size)} | ${deps} |`;
}

function plainRow(name, entry) {
  const deps = entry.depends?.length ?? 0;
  return `| \`${name}\` | ${entry.version} | ${deps} |`;
}

function sizedTable(rows) {
  return ['| 패키지 | 버전 | 크기 | 의존성 |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

function plainTable(rows) {
  return ['| 패키지 | 버전 | 의존성 |', '| --- | --- | --- |', ...rows].join('\n');
}

async function main() {
  const { version, indexUrl } = await loaderConfig();
  const url = `${indexUrl}pyodide-lock.json`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`락파일을 받지 못했습니다 (${response.status}): ${url}`);
  const lock = await response.json();
  checkValues(lock.packages);

  // 이름은 소문자로 맞춰 찾는다. 락파일 키는 배포명 그대로라 대소문자가 섞여 있다.
  const byLower = new Map(Object.entries(lock.packages).map(([n, e]) => [n.toLowerCase(), [n, e]]));

  // 분야 표에 실을 것부터 골라내고, 그것들만 크기를 잰다.
  // GROUPS 에 적었는데 락파일에 없으면 알려 준다. 오타인지 정말 없는 것인지
  // 출력에 남지 않으면 표가 비어 있어도 아무도 알아채지 못한다.
  const missing = [];
  const picked = GROUPS.map(({ title, names }) => ({
    title,
    hits: names
      .map((n) => {
        const hit = byLower.get(n.toLowerCase());
        if (!hit) missing.push(n);
        return hit;
      })
      .filter(Boolean),
  }));

  if (missing.length) {
    console.warn(`GROUPS 에 적혔지만 락파일에 없어 표에서 빠집니다: ${missing.join(', ')}`);
  }

  const grouped = new Set(picked.flatMap(({ hits }) => hits.map(([name]) => name)));
  const sizes = await measureAll(
    indexUrl,
    picked.flatMap(({ hits }) => hits),
  );

  const sections = picked
    .map(({ title, hits }) =>
      hits.length
        ? `### ${title}\n\n${sizedTable(hits.map(([n, e]) => sizedRow(n, e, sizes.get(n))))}\n`
        : '',
    )
    .filter(Boolean);

  const all = Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b));
  const total = all.length;
  const rest = all.filter(([name]) => !grouped.has(name));

  // 태그를 손으로 적으면 다음 ABI 에서 틀린 채로 남는다. 락파일 값에서 만든다.
  const abiTag = lock.info.abi_version ? `pyemscripten_${lock.info.abi_version}` : 'pyemscripten';

  const body = `# Pyodide 에 들어 있는 패키지

Pyodide 가 미리 WebAssembly 로 빌드해 배포하는 패키지 목록이다. 이 목록에 있으면 \`micropip.install()\` 한 줄로 바로 쓸 수 있다. 없어도 순수 파이썬 패키지라면 PyPI 에서 받아 설치할 수 있다. 그 판별법은 아래에 있다.

> 이 문서는 \`mise run docs:packages\` 가 락파일에서 만든다. 손으로 고치지 말자. 다음 릴리스에서 덮어쓰인다.

## 기준

| 항목 | 값 |
| --- | --- |
| Pyodide | ${version} |
| Python | ${lock.info.python} |
| Emscripten | ${lock.info.platform} |
| ABI 태그 | ${abiTag} |
| 패키지 수 | ${total}개 |

크기는 wheel 파일 자체의 크기다. wheel 은 이미 zip 이라 전송할 때 더 줄지 않는다. 그래서 표의 숫자가 곧 내려받는 양이다. 의존성 열은 그 패키지가 함께 끌고 오는 패키지 수다. \`scikit-learn\` 처럼 \`scipy\` 를 끌고 오는 것은 실제 부담이 표의 숫자보다 훨씬 크다.

## 자주 쓰는 것부터

${sections.join('\n')}
## 그 밖

크기는 자주 쓰는 것만 쟀다. 나머지가 궁금하면 \`mise run docs:packages\` 의 GROUPS 에 이름을 넣으면 된다.

${plainTable(rest.map(([name, entry]) => plainRow(name, entry)))}

## 목록에 없는 패키지 쓰기

락파일에 없어도 **순수 파이썬 패키지**라면 \`micropip\` 이 PyPI 에서 받아 설치한다. PyPI 는 CORS 를 허용하므로 브라우저에서 바로 내려받힌다.

\`\`\`python
import micropip
await micropip.install("plotly")
\`\`\`

\`plotly\` 와 \`seaborn\` 이 대표적이다. 둘 다 락파일에는 없지만 순수 파이썬이라 이렇게 설치된다.

되는지 판별하는 법은 간단하다. PyPI 의 그 패키지 "Download files" 탭을 열어 \`*-py3-none-any.whl\` 이 있는지 본다.

| 파일 이름 | 뜻 | Pyodide 에서 |
| --- | --- | --- |
| \`foo-1.0-py3-none-any.whl\` | 순수 파이썬 | \`micropip\` 으로 설치된다 |
| \`foo-1.0-cp314-cp314-manylinux_2_17_x86_64.whl\` | 리눅스용 네이티브 확장 | 안 된다. 아키텍처가 다르다 |
| \`foo-1.0-cp314-cp314-${abiTag}_wasm32.whl\` | Pyodide 용으로 빌드된 것 | 된다 |

세 번째 줄이 PEP 783 이 만든 변화다. 예전에는 Pyodide 팀이 패키지를 직접 빌드해 배포해야 했지만, 이제는 패키지를 만든 사람이 PyPI 에 Pyodide 용 wheel 을 직접 올릴 수 있다.

## 안 되는 것과 그 이유

| 패키지 | 왜 안 되나 |
| --- | --- |
| \`konlpy\` | wheel 은 순수 파이썬이지만 안에서 JVM 을 부른다. 브라우저에 JVM 이 없다 |
| \`kiwipiepy\` | C++ 확장이다. Pyodide 용 wheel 이 아직 없다 |
| \`psycopg\`, \`mysqlclient\` | TCP 소켓이 필요하다. 브라우저는 소켓을 열 수 없다 |
| \`multiprocessing\` 을 쓰는 것 | 프로세스를 만들 수 없다. \`threading\` 도 마찬가지다 |

정리하면 걸리는 이유는 셋 중 하나다. 네이티브 확장이 Pyodide 용으로 빌드되지 않았거나, 브라우저에 없는 것(소켓, 스레드, 프로세스, JVM)을 쓰거나, 파일시스템을 진짜라고 가정하거나. 자세한 것은 [원리 문서](tutorials/README.md)에 있다.
`;

  await writeFile(OUT, body);
  console.log(`docs/packages.md 생성 — Pyodide ${version}, 패키지 ${total}개`);
}

await main();
