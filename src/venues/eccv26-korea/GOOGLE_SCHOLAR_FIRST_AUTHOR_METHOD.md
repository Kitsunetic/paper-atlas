# Google Scholar-first author reaudit methodology

이 문서는 현재의 `eccv_2026_first_author_google_scholar_audit.csv`와
`eccv_2026_first_author_google_scholar_works.csv`에만 적용되는 권위 있는
방법론이다. 저장소의 `TOP_TIER_FIRST_AUTHOR_METHOD.md`와 기존 top-tier CSV는
과거의 다중 출처 작업이므로 본 결과의 근거나 보완 자료로 결합하지 않는다.

## 범위와 원칙

이 산출물의 신원 확인과 과거 연구 판정에는 Google Scholar만 사용한다. ECCV 2026 대상 논문의 이름·소속은 변경하지 않는 기준선으로 보존하고, Scholar에서 확인할 수 없는 내용은 다른 웹페이지, PDF, 출판사, 개인 홈페이지, OpenAlex, 검색 스니펫으로 보완하지 않는다. Scholar 결과가 없으면 `unknown`으로 남긴다.

`matched`는 후보의 Scholar 프로필 또는 Scholar 저자 레코드가 대상 ECCV 제목과 함께 확인되고, 프로필 heading이 대상 연구자의 이름과 일치하는 경우에만 사용한다. 검색 결과에 보이는 추천 프로필, 이름만 같은 저자, 또는 외부 페이지의 연결만으로는 매칭하지 않는다.

## 매칭 게이트와 접근 실패

다음 두 조건을 모두 만족해야 한다.

1. 가져온 Scholar 프로필 페이지의 heading이 후보 이름과 정규화 후 일치한다.
2. 같은 Scholar 프로필의 publication history에 ECCV 대상 제목과 정확히 일치하는 `gsc_a_at` 제목 행이 있다.

프로필 heading과 ECCV 제목 행 중 하나라도 없거나, 프로필이 다른 사람으로 확인되면 `unknown`이다. 페이지가 CAPTCHA, unusual-traffic, HTTP 429/403, 로그인 요구, 파싱 실패, 잘린 HTML, 미완성 history를 반환하면 `unknown`이며, 이는 “검색 결과가 없음”과 구별되는 접근 차단 사유로 `unknown_reason`에 보존한다(예: `access_blocked_http_429`, `profile_history_access_blocked_at_cstart=100`). 접근 차단을 no-match나 검증된 0건으로 바꾸지 않는다. `unknown` 행에는 Scholar 검색 URL만 두고 profile/evidence URL과 모든 수치 count는 비워 둔다.

## 전체 history와 날짜·저자 판정

매칭된 프로필은 첫 페이지 하나만 읽지 않는다. Scholar가 표시하는 range/row metadata와 페이지 이동을 따라 모든 publication-history 페이지를 읽고, `more` 버튼이 비활성화된 종료 상태와 유효한 범위를 확인해야 complete로 간주한다. 중간 페이지가 차단·오류·파싱 실패이면 해당 후보를 unknown으로 되돌린다.

각 Scholar publication row에서 저자 문자열을 읽고, 구분자 앞의 첫 token이 후보 heading/name과 일치할 때만 `author_position=first`로 기록한다. 나중 저자, 저자 수, 인용 수, 제목 유사성으로 첫 저자임을 추정하지 않는다. 날짜는 Scholar 레코드의 publication year/date를 사용하며 기준일은 2026-03-05 (포함)이다.

## 허용 venue와 work row

다음 venue만 포함한다: `CVPR`, `ICCV`, `ECCV`, `NeurIPS`, `ICLR`, `ICML`, `SIGGRAPH`, `SIGGRAPH Asia`, `IROS`, `ICRA`, `RA-L`. 일반 venue는 `main_conference_full_paper`, `RA-L`은 `journal_article`이어야 한다. workshop, WACV, demo, abstract, poster-only, symposium, preprint, 기타 venue는 제외한다. 포함 work는 기준일 이전 또는 당일이어야 하며, 대상 ECCV 2026 논문 자체는 cutoff 뒤이므로 과거 work로 세지 않는다.

## 기여 표시의 세 버킷

각 포함 work는 서로 겹치지 않는 다음 버킷 하나에만 들어간다.

- `first_listed_unmarked`: Scholar publication row가 정상적으로 보이고 후보가 첫 listed author이지만, Scholar에 기여 표시가 없다. 이것은 단독 기여(first/sole contribution)의 증거가 아니다.
- `explicit_equal_contribution_first`: Scholar가 저자 표시에 literal equality phrase를 보여 주는 경우에만 사용한다. 허용되는 예는 `equal contribution`, `contributed equally`, `co-first author`처럼 Scholar 화면에 실제로 나타난 문구다. 반드시 그 문구가 담긴 Scholar marker URL과 텍스트를 보존한다. 별표·†·‡ 같은 glyph만으로는 이 버킷에 넣지 않는다.
- `contribution_marker_unknown`: Scholar가 bare glyph만 보여 주거나(`bare_glyph`), marker 정보를 노출하지 않거나 history/marker 접근이 불완전한 경우(`unavailable`)다. glyph의 의미를 외부 PDF나 관행으로 해석하지 않는다.

따라서 `first_listed_unmarked`를 sole contribution으로 읽거나, Scholar에 없는 equality phrase를 보충하여 `explicit_equal_contribution_first`로 올리는 행위는 금지한다. 최종 count는 위 세 버킷의 합이며, unknown 후보에는 work row와 0 count를 기록하지 않는다.

## 재현 가능한 merge

각 `shard-01`부터 `shard-08` 디렉터리는 `candidates.csv`와 `works.csv`를 모두 제공해야 한다. merge 스크립트는 8개 shard가 모두 존재하지 않으면 중단하고, candidate key 또는 work ID가 중복되면 중단한다. 성공 시 key와 work ID 기준으로 결정적으로 정렬한 두 새 CSV를 임시 파일에 쓴 뒤 rename하여 교체한다. 먼저 immutable 기준선과 validator를 통과해야 하며, 실패 시 최종 산출물은 쓰지 않는다.
