/** 공공누리 제1유형(출처표시) 및 데이터 출처 */
export function Attribution() {
  return (
    <footer className="border-t border-slate-200 bg-white px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
      <div className="flex items-start gap-2.5">
        <a href="https://www.kogl.or.kr/info/licenseType1.do" target="_blank" rel="noreferrer" className="shrink-0" title="공공누리 제1유형: 출처표시">
          <img src="/kogl-type1.png" alt="공공누리 제1유형 (출처표시)" width={86} height={32} />
        </a>
        <p>
          이 서비스는 <b className="font-medium text-slate-600">한국환경공단</b>의 「전기자동차 충전소 정보」(
          <a className="underline hover:text-blue-600" href="https://www.data.go.kr/data/15076352/openapi.do" target="_blank" rel="noreferrer">공공데이터포털</a>
          )를 공공누리 제1유형(출처표시) 조건에 따라 이용합니다.
        </p>
      </div>
      <p className="mt-1">
        슈퍼차저 위치:{' '}
        <a className="underline hover:text-blue-600" href="https://supercharge.info" target="_blank" rel="noreferrer">supercharge.info</a>
        {' '}· 지도·경로·장소: TMAP
      </p>
    </footer>
  );
}
