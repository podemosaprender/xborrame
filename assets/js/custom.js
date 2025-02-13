$(document).ready(function(){
    hideLoading();
    $(".showLoadingMenuItem, .showLoadingMenu li").click( showLoadingNewPage );
    $(".showLoading").click( showLoading );
    
});

function hideLoading() {
    $('#page').css('display', 'block');
    $('#loader').css('display', 'none');
}

function showLoadingNewPage() {
    $('#page').css('display', 'none');
    $('#loader').css('display', 'block');
}

function showLoading() {
    $('#loader').css('display', 'block');
}

function transformToUpperCase(element){
    setTimeout(function(){
        element.value = element.value.toUpperCase();
    }, 1);
}