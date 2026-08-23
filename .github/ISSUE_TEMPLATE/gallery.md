---
name: 갤러리 예제
about: 새 예제 하나를 추가합니다
title: 'feat(NN-job-name): '
labels: enhancement
assignees: ''
---

<!-- 문단 안에서 줄을 바꾸지 않습니다. 한 줄로 이어 써주세요. -->

## 배경

<!-- 이 예제가 왜 필요한지, 앞 예제와 어떻게 이어지는지 적습니다. -->

## 배우는 개념

<!-- 이 예제로 익히는 API 와 개념을 나열합니다. -->

-
-

## 만들 것

<!-- 화면에 무엇이 보이고 무엇을 조작할 수 있는지 적습니다. -->

## Acceptance Criteria

<!-- issue-goal-reviewer 가 이 항목을 기준으로 판정합니다. -->

- [ ] `galleries/NN-job-name/` 에 README.md, index.html, src/ 가 있다
- [ ] 브라우저에서 실제로 동작하고 콘솔 에러가 없다 (스크린샷을 PR 에 첨부)
- [ ] 첫 로딩 중 안내가 보이고, WASM 미지원 환경에서는 배너가 뜬다
- [ ] `_shared/pyodide.js` 의 `getPyodide()` 를 쓴다. `loadPyodide()` 를 직접 부르지 않는다
- [ ] README 가 정해진 뼈대를 지킨다 (배우는 것, 실행 방법, 코드 해설, 직접 해볼 것, 막히는 지점, 다음 예제)
- [ ] `galleries/README.md` 목차에 링크가 추가됐다
- [ ] `prek run --all-files` 와 `mise run check` 가 통과한다
- [ ] Pyodide 말고 다른 외부 의존성이나 빌드 도구를 쓰지 않았다

## 참고 자료

<!-- 관련 스펙 섹션, 데모, 이전 예제 링크 -->
