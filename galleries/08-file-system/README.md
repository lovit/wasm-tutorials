# 08. 파일 다루기

브라우저 안의 파일시스템이 어디까지 진짜인지 보고, 파일을 올리고 내려받고 새로고침해도 남게 한다.

![예제 화면. 지금 있는 파일들 표에 /work 아래 report.txt 151 B 와 sample.txt 41 B, /persist 아래 synced.txt 25 B, /unpacked 아래 풀린것 폴더와 그 안의 파일 셋이 크기와 함께 나열돼 있다. 파일 올리기 절에는 sample.txt 가 41바이트이고 앞부분이 안녕하세요 파이썬이라는 결과가 있다. 파일 내려받기 절에는 report.txt 를 만들어 내려받았다는 안내가, 새로고침해도 남게 하기 절에는 synced.txt 를 쓰고 syncfs 까지 불렀다는 안내가 있다.](screenshot.png)

> 이 문서의 측정값은 Chrome 151.0.7922.34 (headless, macOS) 에서 2026-08-23 에 Pyodide 314.0.5 로 확인한 것이다.

## 무엇을 배우나

- `pyodide.FS` 로 자바스크립트가 파일을 넣고 꺼낸다. 파이썬은 그냥 파일로 본다
- 올린 파일을 파이썬에게 주는 길과, 파이썬이 만든 것을 내려받는 길
- 기본 파일시스템은 새로고침하면 사라진다
- IDBFS 는 남지만 `syncfs` 를 불러야 한다. 안 부르면 조용히 사라진다
- 파이썬 목록을 훑을 때 나오는 항목은 반복이 끝나면 회수된다. `break` 로 빠져나오면 남는다

## 실행 방법

```bash
mise run serve
```

브라우저로 `http://localhost:4173/galleries/08-file-system/` 를 연다. 파일을 올리고, 내려받고, 저장해 본 뒤 새로고침해 보면 된다.

## 핵심 코드

### 1. 파일시스템은 메모리 위의 흉내다

파이썬이 보는 `/tmp`, `/home`, `/lib` 은 진짜 디스크가 아니다. Emscripten 이 메모리에 만들어 둔 자료 구조이고, 파이썬의 파일 함수들이 그것을 진짜 파일처럼 다룬다. 그래서 `open()` 도 `pathlib` 도 그대로 된다.

```python
def list_tree(root: str) -> list[tuple[str, int, bool]]:
    """폴더 하나를 훑어 (경로, 크기, 폴더인가) 목록을 만든다."""
    base = Path(root)
    if not base.exists():
        return []
```

메모리 위에 있으니 탭을 닫으면 사라진다. 새로고침도 마찬가지다.

### 2. 올린 파일을 파이썬에게 주기

브라우저가 준 `File` 을 바이트로 바꿔 파일시스템에 쓰면 끝이다.

```js
const bytes = new Uint8Array(await file.arrayBuffer());
// 이름을 그대로 붙이지 않는다. .. 가 들어 있으면 /work 밖에 쓰게 된다.
// 파일 선택기는 그런 이름을 주지 않지만, 드래그앤드롭이나 원격에서 온 이름은 다르다.
const path = `${WORK}/${file.name.split('/').pop()}`;
pyodide.FS.writeFile(path, bytes);
```

이 세 줄이 브라우저와 파이썬이 만나는 자리다. 이름을 그대로 붙이지 않는 것을 눈여겨보자. `..` 가 들어 있으면 `/work` 밖에 쓰게 된다. 파일 선택기는 그런 이름을 주지 않지만 드래그앤드롭이나 원격에서 받은 이름은 다르다.

그다음부터 파이썬은 평범한 파일로 읽는다.

```python
    size = target.stat().st_size
    with target.open("rb") as handle:
        head = handle.read(240)
```

앞부분만 보여 줄 것이라 통째로 읽지 않는다. 크기는 `stat()` 이 알려 준다. 몇십 MB 짜리를 올려도 이 함수 때문에 한 벌이 더 잡히는 일이 없다.

자를 때도 조심할 것이 있다.

```python
    text = head.decode("utf-8", errors="replace")
```

바이트 수로 자르면 글자 중간이 끊긴다. `errors` 를 안 주면 그 자리에서 `UnicodeDecodeError` 가 나고, 평범한 한글 파일이 통째로 16진수로 보인다. 한 글자가 세 바이트라 240에서 자르면 자주 걸린다.

**파일이 브라우저 밖으로 나가지 않는다.** 서버로 올리는 것이 아니라 같은 탭 안에서 옮기는 것이다. 개발자 도구 네트워크 탭을 열어 두고 파일을 골라 보면 아무 요청도 안 나간다. 개인정보가 든 자료를 다룰 때 값이 큰 성질이다.

### 3. 만든 파일을 내려받기

반대 방향은 `Blob` 을 거친다.

```js
const url = URL.createObjectURL(new Blob([bytes], { type: 'text/plain' }));
const link = document.createElement('a');
link.href = url;
link.download = 'report.txt';
link.click();
// 주소는 페이지가 사는 동안 남으므로 다 쓰면 놓아 준다.
URL.revokeObjectURL(url);
```

`createObjectURL` 이 만든 주소는 페이지가 사는 동안 남는다. 파일을 여러 번 만들다 보면 쌓이므로 다 쓰면 놓아 준다. 05번의 손잡이와 결이 같다.

### 4. 새로고침해도 남게 하려면

`/persist` 를 IDBFS 로 마운트하면 IndexedDB 에 저장할 수 있다. 붙이는 것은 자바스크립트 쪽 일이고, 파이썬은 그냥 폴더로 본다.

```js
pyodide.FS.mkdirTree(PERSIST);
pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, {}, PERSIST);
// 켤 때 한 번 읽어 와야 지난번에 저장한 것이 보인다.
await syncfs(pyodide, true);
```

여기서 가장 자주 걸리는 것이 `syncfs` 다. **쓰기만 하면 저장되지 않는다.**

```js
function syncfs(pyodide, fromDb) {
  return new Promise((resolve, reject) => {
    pyodide.FS.syncfs(fromDb, (error) => (error ? reject(error) : resolve()));
  });
}
```

IndexedDB 가 비동기라 콜백으로 온다. Promise 로 감싸 두면 부르는 쪽이 편하다. `fromDb` 가 `true` 면 저장된 것을 읽어 오고, `false` 면 지금 것을 저장한다.

두 버튼을 눌러 보고 새로고침하면 차이가 그대로 드러난다. Chrome 151 에서 확인한 결과다.

| 한 일                                | 새로고침 뒤 |
| ------------------------------------ | ----------- |
| `synced.txt` 를 쓰고 `syncfs(false)` | 남아 있다   |
| `forgot.txt` 를 쓰기만               | 사라졌다    |

쓴 직후에는 둘 다 화면에 보인다. 메모리에는 들어갔기 때문이다. 그래서 잘못을 그 자리에서 알아채기 어렵다. 새로고침해야 드러난다.

실무로 옮기면 규칙은 단순하다. **쓰고 나면 곧바로 `syncfs(false)` 를 부른다.** 나중에 몰아서 하려다 보면 그 사이에 탭이 닫힌다.

### 5. 반복하면서 나온 손잡이는 반복이 끝나면 죽는다

목록을 훑어 이름만 모으려다 걸렸다.

```js
const names = [...rows].map((row) => {
  const [path] = row.toJs();
  return path.slice(PERSIST.length + 1);
});
```

```text
This borrowed proxy was automatically destroyed when an iterator was exhausted.
```

07번에서 본 것과 같은 말인데 뒷부분이 다르다. 거기서는 "함수 호출이 끝나서" 였고 여기서는 "반복이 끝나서" 다. 파이썬 목록을 훑으면 항목마다 손잡이가 나오는데, 그것도 빌려주는 것이다. 반복이 다 돌면 회수된다.

`[...rows]` 는 반복을 먼저 끝내고 배열을 만든다. 그러니 배열에 담긴 것은 전부 죽은 손잡이다. 고치는 법은 간단하다. 반복 도중에 값으로 바꾸면 된다.

```js
for (const row of rows) {
  const [path] = row.toJs();
  names.push(path.slice(PERSIST.length + 1));
}
```

`row.destroy()` 를 부르지 않는 것도 눈여겨보자. 빌린 것이라 반복이 알아서 회수한다. 불러도 터지지는 않는다. `destroy()` 는 여러 번 불러도 조용히 넘어가고, 그 뒤에 반복자가 회수하려 할 때도 마찬가지다. 문제가 되는 것은 놓는 것이 아니라 **놓은 뒤에 쓰는 것**이다. 그때 `Object has already been destroyed` 가 난다.

반대로 반복 도중에 `break` 로 빠져나오면 그 항목은 회수되지 않고 살아남는다. 반복이 끝까지 돌아야 회수하기 때문이다. 중간에 나올 생각이면 그때는 직접 놓아 줘야 한다.

### 6. 압축 파일 풀기

파일 여러 개를 한꺼번에 넣을 때 쓴다.

```js
pyodide.unpackArchive(made.toJs(), 'zip', { extractDir: UNPACKED });
```

`unpackArchive` 는 `ArrayBuffer` 나 그 뷰(`Uint8Array` 같은 것)를 받는다. 파이썬이 만든 `bytes` 는 손잡이로 오므로 `toJs()` 로 바꿔 넘긴다. 손잡이를 그대로 주면 이렇게 난다.

```text
Expected argument 'buffer' to be an ArrayBuffer or an ArrayBuffer view
```

`.buffer` 를 꺼내 넘기는 관용구를 자주 보는데 조심할 것이 있다. 뷰가 큰 버퍼의 일부만 가리키는 경우 `.buffer` 는 그 전체를 준다. 뷰째로 넘기는 편이 안전하다.

원격 zip 을 받아 푸는 것도 같은 모양이다. 데이터셋이나 폰트 묶음을 한 번에 넣을 때 쓴다.

## 직접 해볼 것

- 개발자 도구 네트워크 탭을 열어 두고 파일을 올려 보자. 아무 요청도 안 나간다
- "쓰고 저장까지" 와 "쓰기만 하고 저장 안 함" 을 둘 다 누른 뒤 새로고침해 보자. 하나만 남는다
- 새로고침 직전에는 둘 다 보인다는 것도 확인하자. 메모리에는 들어가 있다
- 개발자 도구 Application 탭에서 IndexedDB 를 열어 보자. `/persist` 라는 이름의 저장소가 있다
- `/work` 에 파일을 여럿 올리고 "만들어서 내려받기" 를 눌러 보자. 보고서에 목록이 들어간다
- 큰 파일을 올려 보자. 몇십 MB 를 올리면 05번에서 본 대로 WebAssembly 힙이 자란다
- 파이썬 코드에서 `/persist` 대신 `/tmp` 에 써 보자. 새로고침하면 사라진다
- 같은 파일을 두 번 골라 보자. 두 번 다 결과가 갱신된다. 입력칸을 비워 두지 않으면 두 번째에 아무 일도 안 일어난다
- 한글이 든 텍스트 파일을 올려 보자. 글자로 보인다. `src/main.py` 에서 `errors="replace"` 를 지우고 다시 해 보면 16진수로 바뀐다

## 막히는 지점

| 증상 | 원인 |
| --- | --- |
| 새로고침하니 파일이 사라졌다 | 기본 파일시스템은 메모리다. `/persist` 같은 IDBFS 폴더에 써야 남는다 |
| IDBFS 에 썼는데도 사라졌다 | `syncfs(false)` 를 안 불렀다. 쓰기만 해서는 저장되지 않는다 |
| 켤 때 지난번 파일이 안 보인다 | `syncfs(true)` 로 읽어 오지 않았다 |
| `This borrowed proxy was automatically destroyed when an iterator was exhausted` | 반복하며 나온 손잡이를 배열에 모아 뒀다. 반복 도중에 값으로 바꾸자 |
| `unpackArchive` 가 파이썬 bytes 를 안 받는다 | `toJs()` 로 바꿔 넘겨야 한다. 손잡이 그대로는 안 된다 |
| 내려받기가 여러 번이면 메모리가 는다 | `URL.revokeObjectURL` 을 빼먹었다 |

## 더 읽을 것

MEMFS 가 어떻게 만들어졌는지, Emscripten 이 파일 관련 시스템 콜을 어떻게 흉내 내는지는 [02. CPython 을 브라우저로 옮기기](../../docs/tutorials/02-emscripten-and-cpython.md)에서 다룬다.

## 다음 예제

[09. PyPI 에서 설치하기](../09-packages-micropip/) — 락파일에 없는 패키지를 브라우저에서 받아 쓴다.
