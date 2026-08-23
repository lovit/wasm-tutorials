# 02. 로딩 비용 드러내기

패키지를 골라 받아 보면서 얼마가 더 드는지, 의존성이 얼마나 딸려 오는지, 미리 받는 것이 정말 빠른지 잰다.

![예제 화면. 위쪽 상자에 런타임이 975 ms 만에 준비됐고 패키지는 아직 받지 않았다고 적혀 있다. 아래 패키지 고르기 상자에서 numpy 와 pandas 가 체크돼 있고, 그 아래에 2개를 골랐는데 5개를 받게 되며 python-dateutil, pytz, six 가 딸려 온다는 안내가 있다. 받는 동안 로그에는 Loading 과 Loaded 두 줄이 찍혀 있다. 비용 표에는 부팅까지 975 ms, 패키지 받는 데 422 ms, 합쳐서 1,398 ms, 받은 wheel 수 5개, 네트워크를 탄 양 7.23 MiB, 압축을 푼 뒤 크기 7.48 MiB 가 적혀 있다. 확인 상자에 numpy 2.4.6 과 pandas 3.0.2 가 나오고, 그 아래에는 부팅과 함께 받아 보는 링크가 두 개 있다.](screenshot.png)

> 이 문서의 측정값은 Chrome 151.0.7922.34 (headless, macOS) 에서 2026-08-23 에 Pyodide 314.0.5 로 잰 것이다. 네트워크를 조인 값은 Chrome DevTools Protocol 로 대역폭과 지연을 지정해 잰 것이고, 각 조건마다 캐시가 빈 새 컨텍스트로 3회 돌린 중간값이다.

## 무엇을 배우나

- 패키지를 고르면 자기 의존성을 함께 끌고 온다. pandas 하나가 다섯 개가 된다
- `loadPackage(_, { messageCallback })` 로 받는 동안 무슨 일이 일어나는지 흘려보낸다
- `loadPyodide({ packages })` 로 부팅과 함께 받는 것이 언제 이득인지. 문서 말과 실측이 다르다
- 파이썬에 값을 넘길 때는 문자열로 이어 붙이지 않고 `globals` 로 넘긴다

## 실행 방법

```bash
mise run serve
```

브라우저로 `http://localhost:4173/galleries/02-loading-progress/` 를 연다. 패키지를 고르고 "지금 받기" 를 누르면 된다.

## 핵심 코드

### 1. 고른 것보다 많이 받는다

pandas 하나만 체크해도 다섯 개를 받는다. numpy, python-dateutil, pytz, six 가 딸려 온다. 그걸 미리 알려면 락파일의 의존 관계를 따라가면 된다.

```js
function closureOf(packages, names) {
  // 락파일 키는 소문자로 정규화돼 있지만, 고른 이름이 그렇다는 보장은 없다.
  const byLower = new Map(Object.keys(packages).map((key) => [key.toLowerCase(), key]));
  const found = new Set();
  const queue = [...names];

  while (queue.length) {
    const key = byLower.get(queue.shift().toLowerCase());
    if (!key || found.has(key)) continue;
    found.add(key);
    queue.push(...(packages[key].depends ?? []));
  }

  return [...found].sort();
}
```

의존성의 의존성까지 따라가야 해서 너비 우선으로 훑는다. pandas 는 numpy 를, scikit-learn 은 scipy 와 joblib 을 끌고 오고, scipy 는 다시 numpy 를 끌고 온다.

Pyodide 314.0.5 락파일 기준이다.

| 고른 것 | 실제로 받는 것 | 딸려 오는 것 |
| --- | --- | --- |
| numpy | 1개 | 없음 |
| pandas | 5개 | numpy, python-dateutil, pytz, six |
| scikit-learn | 5개 | joblib, numpy, scipy, threadpoolctl |
| pandas + scikit-learn | 9개 | joblib, numpy, python-dateutil, pytz, scipy, six, threadpoolctl |

락파일을 따로 받을 필요는 없다. Pyodide 가 부팅하며 이미 읽었고 그대로 꺼내 준다.

```js
lock = pyodide.lockfile;
```

### 2. 받는 동안 말을 걸어 준다

7 MiB 를 받는 동안 화면이 조용하면 멈춘 줄 안다.

```js
await pyodide.loadPackage(names, {
  // 진행 상황이 그대로 흘러온다. 몇 초 동안 아무 말이 없으면 멈춘 줄 안다.
  messageCallback: (message) => appendLog(message),
  errorCallback: (message) => appendLog(`오류: ${message}`),
});
```

흘러오는 것은 생각보다 성기다. numpy 와 pandas 를 받으면 두 줄뿐이다.

```text
Loading numpy, pandas, python-dateutil, pytz, six
Loaded numpy, pandas, python-dateutil, pytz, six
```

파일별 진행률 같은 것은 오지 않는다. 그래서 진행 막대를 만들려면 이 콜백만으로는 부족하고, `performance.getEntriesByType('resource')` 를 함께 봐야 한다. 이 예제가 비용 표를 그렇게 만든다.

### 3. 이번에 받은 것만 센다

런타임 자체 파일까지 세면 패키지 비용이 묻힌다. wheel 만 고른다.

```js
function wheelEntries() {
  return performance.getEntriesByType('resource').filter((entry) => entry.name.endsWith('.whl'));
}
```

이것만으로는 페이지를 연 뒤 받은 wheel 을 전부 센다. "이번에" 를 만드는 것은 다음 두 줄이다.

```js
const before = wheelEntries().length;
```

```js
reportAfterBoot(performance.now() - started, wheelEntries().slice(before));
```

Resource Timing 엔트리는 지워지지 않고 뒤에만 붙는다. 그래서 받기 직전에 길이를 잡아 두면 그 뒤가 이번에 받은 것이다.

확장자로 거르는 방식에는 한계가 있다. 이 예제가 다루는 넷은 전부 wheel 로 오지만, 락파일에는 `.zip` 으로 오는 공유 라이브러리도 있다. `libgeos` 같은 것들이다. 그런 것을 끌고 오는 패키지를 고르면 이 함수는 그 비용을 놓친다.

### 4. 값은 코드에 끼워 넣지 않는다

받은 패키지가 정말 import 되는지 확인할 때, 패키지 이름을 파이썬 코드 문자열에 이어 붙이고 싶어진다. 그러지 않는다.

```js
async function verify(pyodide, names) {
  const globals = pyodide.toPy({ NAMES: names.join(',') });
  try {
    checkBox.textContent = await pyodide.runPythonAsync(CHECK, { globals });
  } catch (error) {
    checkBox.replaceChildren();
    renderPythonError(checkBox, error);
  } finally {
    globals.destroy();
  }
}
```

`toPy()` 로 만든 것도 `PyProxy` 라서 다 쓰면 놓아 줘야 한다. 그래서 `finally` 에서 `destroy()` 한다.

지금은 이름이 우리가 정한 목록에서만 오니까 이어 붙여도 사고가 나지 않는다. 다만 사용자가 넣은 값이 섞이는 순간 이야기가 달라지고, 그때 습관을 바꾸기보다 처음부터 이렇게 쓰는 편이 낫다.

`globals` 를 주면 그 코드는 기본 전역 대신 넘긴 것을 본다. 앞서 정의해 둔 이름이 안 보인다는 뜻이다. 여기서는 짧은 코드 한 조각만 돌리므로 오히려 깔끔하다.

### 5. 미리 받기는 지연이 클 때만 이득이다

Pyodide 문서는 `loadPyodide({ packages })` 가 부팅 뒤 `loadPackage()` 를 부르는 것보다 빠르다고 한다. 부팅과 병렬로 내려받기 때문이다. 재 보면 조건에 따라 크게 다르다.

페이지를 연 시점부터 고른 패키지가 준비될 때까지를 쟀다. 캐시가 빈 새 컨텍스트에서 조건마다 3회 돌린 중간값이다.

| 회선                        | 패키지 | 미리 받기 | 나중에 받기 | 차이           |
| --------------------------- | ------ | --------- | ----------- | -------------- |
| 대역폭 4 Mbps, 지연 60 ms   | numpy  | 18,832 ms | 18,899 ms   | 67 ms (0%)     |
| 대역폭 4 Mbps, 지연 60 ms   | pandas | 27,050 ms | 27,832 ms   | 782 ms (3%)    |
| 대역폭 20 Mbps, 지연 600 ms | numpy  | 7,387 ms  | 8,186 ms    | 799 ms (10%)   |
| 대역폭 20 Mbps, 지연 600 ms | pandas | 8,635 ms  | 9,969 ms    | 1,334 ms (13%) |

대역폭이 병목이면 이득이 거의 없고, 지연이 병목이면 10% 넘게 빨라진다.

겹쳐서 받는다고 총 바이트가 주는 것은 아니다. 줄어드는 것은 부팅하는 동안 회선이 놀던 시간뿐이다. 선이 좁으면 부팅 내내 선이 꽉 차 있어서 놀 틈이 없고, 지연이 크면 요청 왕복 때문에 그 틈이 크게 벌어진다. 그래서 절감의 상한은 "부팅 시간에서 다운로드에 쓰이지 않은 부분" 이다.

숫자가 그 모델과 정확히 맞지는 않는다. 4 Mbps 에서 numpy 는 0.4% 인데 pandas 는 3.0% 다. 선이 꽉 찬 조건이라면 둘 다 0 에 가까워야 한다. 왜 pandas 쪽이 더 큰지는 이 측정만으로 설명하지 못한다. 여러 wheel 을 동시에 요청하면서 생기는 차이로 보이지만 확인하지는 않았다.

조이지 않은 회선에서는 결론을 낼 수 없었다. 편차가 차이보다 컸다. numpy 는 중간값이 1,176 ms 대 1,297 ms 인데 개별 측정이 1,151 ms 에서 1,795 ms 까지 흩어졌다. CDN 응답 시간이 지배해서다. 이런 경우에 "우리 쪽이 더 빠릅니다" 라고 쓰면 그건 측정이 아니라 희망이다.

실무로 옮기면 이렇게 된다. 어떤 패키지가 필요할지 확실하다면 `packages` 로 넘기는 편이 낫다. 손해 볼 일이 없고 모바일 회선에서는 눈에 띄게 이득이다. 반대로 사용자가 고른 뒤에야 알 수 있다면 나중에 받아도 잃는 것이 거의 없다.

화면의 비용 표가 두 모드에서 다른 이름을 다는 것도 이 때문이다. 미리 받으면 부팅과 다운로드가 겹쳐 돌아서 나눌 수가 없다. 그래서 미리 받기는 `페이지를 연 뒤 준비까지` 하나만 보여 주고, 나중에 받기는 `부팅까지` 와 `패키지 받는 데` 를 따로 보여 준 뒤 `합쳐서` 를 붙인다. 두 모드를 견주려면 그 `합쳐서` 와 견줘야 한다.

## 직접 해볼 것

- scikit-learn 만 체크해 보자. 다섯 개를 받는다는 안내가 뜬다. 딸려 오는 scipy 가 13 MiB 다
- pandas 와 scikit-learn 을 함께 체크하면 아홉 개가 된다. 겹치는 의존성은 한 번만 센다
- 받고 나서 다시 "받기" 를 눌러 보자. `이미 올라와 있어서 아무것도 받지 않았습니다` 가 뜬다. Pyodide 가 요청 자체를 안 한다
- 브라우저 캐시를 보려면 받은 뒤 새로고침하고 다시 받아야 한다. 그때 `네트워크를 탄 양` 이 0 이 되고 `전부 브라우저 캐시에서 왔습니다` 가 붙는다
- 개발자 도구 네트워크 탭에서 `Slow 4G` 를 켜고 numpy 를 받아 보자. `messageCallback` 이 두 줄만 찍고 한참 조용한 것을 확인한다. 진행률이 왜 이 콜백만으로 안 되는지 알게 된다
- 주소에 `?preload=pandas` 를 붙여 열어 보자. 캐시를 비우고 열어야 차이가 보인다
- `?preload=libgeos` 처럼 목록에 없는 이름을 넣어 보자. 무시된다. 왜 걸러야 하는지는 위 §5 아래 코드에 적어 뒀다
- 아무것도 체크하지 않아 보자. "받기" 버튼이 잠긴다

## 막히는 지점

| 증상 | 원인 |
| --- | --- |
| `네트워크를 탄 양` 이 0 인데 처음 받는 것 같다 | 브라우저가 캐시에서 줬다. 개발자 도구에서 캐시를 비우고 다시 하자 |
| 고른 것보다 훨씬 많이 받는다 | 의존성이 딸려 온다. 안내 문구가 무엇이 딸려 오는지 알려 준다 |
| `?preload=` 로 열었는데 빨라지지 않는다 | 캐시가 남아 있으면 둘 다 즉시 끝난다. 그리고 회선이 빠르면 차이가 묻힌다 |
| `?preload=` 에 적은 이름이 무시된다 | 화면의 체크박스에 있는 넷만 받는다. 그 밖의 값은 거른다 |
| 로그가 두 줄만 찍힌다 | 정상이다. `messageCallback` 은 파일별 진행률을 주지 않는다 |
| 락파일에 없는 패키지를 쓰고 싶다 | `loadPackage` 는 못 한다. `micropip` 이 맡는다. 09번에서 다룬다 |

## 더 읽을 것

어떤 패키지가 들어 있고 각각 얼마인지는 [패키지 목록](../../docs/packages.md)에 있다. wheel 과 ABI 가 무엇인지는 [원리 문서](../../docs/tutorials/README.md)에서 다룬다.

## 다음 예제

[03. 출력과 오류](../03-stdout-and-errors/) — `print` 한 것을 화면으로 돌리고, 트레이스백을 사람이 읽을 수 있게 보여 준다.
