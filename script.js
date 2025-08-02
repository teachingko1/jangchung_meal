// DOM 요소들
const schoolCodeInput = document.getElementById('schoolCode');
const officeCodeInput = document.getElementById('officeCode');
const dateInput = document.getElementById('dateInput');
const searchBtn = document.getElementById('searchBtn');
const resultSection = document.getElementById('resultSection');
const loading = document.getElementById('loading');
const mealInfo = document.getElementById('mealInfo');
const errorMessage = document.getElementById('errorMessage');
const mealDate = document.getElementById('mealDate');
const menuList = document.getElementById('menuList');
const nutritionInfo = document.getElementById('nutritionInfo');
const originInfo = document.getElementById('originInfo');

// 페이지 로드 시 오늘 날짜로 설정
document.addEventListener('DOMContentLoaded', function() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${year}-${month}-${day}`;
});

// 검색 버튼 클릭 이벤트
searchBtn.addEventListener('click', searchMealInfo);

// Enter 키 이벤트
document.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchMealInfo();
    }
});

// 급식 정보 검색 함수
async function searchMealInfo() {
    const schoolCode = schoolCodeInput.value.trim();
    const officeCode = officeCodeInput.value.trim();
    const selectedDate = dateInput.value;

    // 입력값 검증
    if (!schoolCode || !officeCode || !selectedDate) {
        alert('모든 필드를 입력해주세요.');
        return;
    }

    // 날짜 형식 변환 (YYYY-MM-DD -> YYYYMMDD)
    const formattedDate = selectedDate.replace(/-/g, '');
    
    // UI 상태 변경
    showLoading();
    
    // 먼저 CORS 프록시 시도
    await tryCorsProxy(officeCode, schoolCode, formattedDate, selectedDate);
}

// CORS 프록시 시도
async function tryCorsProxy(officeCode, schoolCode, formattedDate, selectedDate) {
    const baseUrl = `https://open.neis.go.kr/hub/mealServiceDietInfo?ATPT_OFCDC_SC_CODE=${officeCode}&SD_SCHUL_CODE=${schoolCode}&MLSV_YMD=${formattedDate}`;
    
    // 여러 CORS 프록시 옵션
    const proxyUrls = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(baseUrl)}`,
        `https://cors-anywhere.herokuapp.com/${baseUrl}`,
        `https://thingproxy.freeboard.io/fetch/${baseUrl}`,
        baseUrl // 직접 호출도 시도
    ];

    // 여러 프록시를 순차적으로 시도
    for (let i = 0; i < proxyUrls.length; i++) {
        try {
            console.log(`Trying proxy ${i + 1}: ${proxyUrls[i]}`);
            
            const response = await fetch(proxyUrls[i], {
                method: 'GET',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            // 응답을 텍스트로 먼저 받아서 확인
            const responseText = await response.text();
            console.log('API Response:', responseText.substring(0, 200) + '...');
            
            // XML인지 JSON인지 확인
            let data;
            if (responseText.trim().startsWith('<?xml')) {
                // XML 응답인 경우 - 간단한 파싱 시도
                data = parseXMLResponse(responseText);
            } else {
                // JSON 응답인 경우
                data = JSON.parse(responseText);
            }
            
            processMealData(data, selectedDate);
            return; // 성공하면 함수 종료
            
        } catch (error) {
            console.error(`Proxy ${i + 1} failed:`, error);
            if (i === proxyUrls.length - 1) {
                // 모든 프록시가 실패한 경우 JSONP 시도
                console.log('All proxies failed, trying JSONP...');
                tryJsonp(officeCode, schoolCode, formattedDate, selectedDate);
            }
        }
    }
}

// JSONP 방식 시도
function tryJsonp(officeCode, schoolCode, formattedDate, selectedDate) {
    const baseUrl = `https://open.neis.go.kr/hub/mealServiceDietInfo?ATPT_OFCDC_SC_CODE=${officeCode}&SD_SCHUL_CODE=${schoolCode}&MLSV_YMD=${formattedDate}`;
    
    // JSONP 콜백 함수 생성
    const callbackName = 'jsonpCallback_' + Date.now();
    window[callbackName] = function(data) {
        console.log('JSONP Response:', data);
        processMealData(data, selectedDate);
        // 스크립트 태그 제거
        document.head.removeChild(script);
        delete window[callbackName];
    };
    
    // 스크립트 태그 생성
    const script = document.createElement('script');
    script.src = `${baseUrl}&callback=${callbackName}`;
    script.onerror = function() {
        console.error('JSONP failed');
        showError();
        document.head.removeChild(script);
        delete window[callbackName];
    };
    
    // 타임아웃 설정
    setTimeout(() => {
        if (window[callbackName]) {
            console.error('JSONP timeout');
            showError();
            document.head.removeChild(script);
            delete window[callbackName];
        }
    }, 10000);
    
    document.head.appendChild(script);
}

// XML 응답 파싱 함수
function parseXMLResponse(xmlText) {
    try {
        // 간단한 XML 파싱 (실제로는 더 복잡할 수 있음)
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        // XML에서 필요한 정보 추출
        const result = {};
        
        // 결과 코드 확인
        const resultCode = xmlDoc.querySelector('CODE');
        if (resultCode) {
            result.RESULT = { CODE: resultCode.textContent };
        }
        
        // 급식 정보 추출
        const dishName = xmlDoc.querySelector('DDISH_NM');
        const calInfo = xmlDoc.querySelector('CAL_INFO');
        const originInfo = xmlDoc.querySelector('ORPLC_INFO');
        
        if (dishName || calInfo || originInfo) {
            result.mealServiceDietInfo = [null, {
                row: [{
                    DDISH_NM: dishName ? dishName.textContent : '',
                    CAL_INFO: calInfo ? calInfo.textContent : '',
                    ORPLC_INFO: originInfo ? originInfo.textContent : ''
                }]
            }];
        }
        
        return result;
    } catch (error) {
        console.error('XML parsing error:', error);
        return { RESULT: { CODE: 'INFO-200' } }; // 에러 시 빈 결과로 처리
    }
}

// 로딩 상태 표시
function showLoading() {
    resultSection.style.display = 'block';
    loading.style.display = 'block';
    mealInfo.style.display = 'none';
    errorMessage.style.display = 'none';
}

// 에러 상태 표시
function showError() {
    loading.style.display = 'none';
    mealInfo.style.display = 'none';
    errorMessage.style.display = 'block';
}

// 급식 데이터 처리
function processMealData(data, selectedDate) {
    loading.style.display = 'none';
    
    // API 응답 구조 확인
    if (data.RESULT && data.RESULT.CODE === 'INFO-200') {
        // 급식 정보가 없는 경우
        showError();
        return;
    }
    
    if (data.mealServiceDietInfo && data.mealServiceDietInfo[1] && data.mealServiceDietInfo[1].row) {
        const mealData = data.mealServiceDietInfo[1].row[0];
        displayMealInfo(mealData, selectedDate);
    } else {
        showError();
    }
}

// 급식 정보 표시
function displayMealInfo(mealData, selectedDate) {
    // 날짜 표시
    const dateObj = new Date(selectedDate);
    const formattedDate = `${dateObj.getFullYear()}년 ${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일`;
    mealDate.textContent = formattedDate;

    // 메뉴 정보 파싱 및 표시
    displayMenu(mealData.DDISH_NM);
    
    // 영양 정보 파싱 및 표시
    if (mealData.CAL_INFO) {
        displayNutrition(mealData.CAL_INFO);
    }
    
    // 원산지 정보 파싱 및 표시
    if (mealData.ORPLC_INFO) {
        displayOrigin(mealData.ORPLC_INFO);
    }

    // 결과 표시
    mealInfo.style.display = 'block';
    errorMessage.style.display = 'none';
}

// 메뉴 표시
function displayMenu(menuString) {
    if (!menuString) {
        menuList.innerHTML = '<p>메뉴 정보가 없습니다.</p>';
        return;
    }

    // 메뉴 문자열 파싱 (알레르기 정보 제거)
    const menuItems = menuString.split('<br/>')
        .map(item => item.trim())
        .filter(item => item && !item.match(/^\d+$/)) // 숫자만 있는 항목 제거
        .map(item => {
            // 알레르기 정보 제거 (괄호 안의 숫자들)
            return item.replace(/\([^)]*\)/g, '').trim();
        })
        .filter(item => item.length > 0);

    if (menuItems.length === 0) {
        menuList.innerHTML = '<p>메뉴 정보가 없습니다.</p>';
        return;
    }

    menuList.innerHTML = menuItems
        .map(item => `<div class="menu-item">${item}</div>`)
        .join('');
}

// 영양 정보 표시
function displayNutrition(nutritionString) {
    if (!nutritionString) {
        nutritionInfo.innerHTML = '<p>영양 정보가 없습니다.</p>';
        return;
    }

    // 영양 정보 파싱
    const nutritionItems = nutritionString.split('<br/>')
        .map(item => item.trim())
        .filter(item => item && item.includes(':'))
        .map(item => {
            const [label, value] = item.split(':').map(part => part.trim());
            return { label, value };
        });

    if (nutritionItems.length === 0) {
        nutritionInfo.innerHTML = '<p>영양 정보가 없습니다.</p>';
        return;
    }

    nutritionInfo.innerHTML = nutritionItems
        .map(item => `
            <div class="nutrition-item">
                <div class="label">${item.label}</div>
                <div class="value">${item.value}</div>
            </div>
        `)
        .join('');
}

// 원산지 정보 표시
function displayOrigin(originString) {
    if (!originString) {
        originInfo.innerHTML = '<p>원산지 정보가 없습니다.</p>';
        return;
    }

    // 원산지 정보 파싱
    const originItems = originString.split('<br/>')
        .map(item => item.trim())
        .filter(item => item && item.includes(':'))
        .map(item => {
            const [food, origin] = item.split(':').map(part => part.trim());
            return { food, origin };
        });

    if (originItems.length === 0) {
        originInfo.innerHTML = '<p>원산지 정보가 없습니다.</p>';
        return;
    }

    originInfo.innerHTML = originItems
        .map(item => `
            <div class="origin-item">
                <strong>${item.food}</strong>: ${item.origin}
            </div>
        `)
        .join('');
}

// 날짜 입력 필드에 오늘 날짜 자동 설정
function setTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${year}-${month}-${day}`;
}

// 페이지 로드 시 오늘 날짜 설정
setTodayDate();
