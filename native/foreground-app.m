#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#include <stdio.h>
#include <unistd.h>

static NSDictionary *windowRect(NSDictionary *window)
{
    NSDictionary *bounds = window[(__bridge NSString *)kCGWindowBounds];
    CGRect rect;
    if (!bounds || !CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)bounds, &rect) ||
        rect.size.width < 100 || rect.size.height < 70) return nil;
    return @{@"x": @(rect.origin.x), @"y": @(rect.origin.y),
             @"width": @(rect.size.width), @"height": @(rect.size.height)};
}

static void reportStoreWindows(pid_t storePID)
{
    static NSDictionary *lastReport;
    NSDictionary *mainWindow = nil;
    NSMutableArray *paymentWindows = [NSMutableArray array];
    if (storePID) {
        // Geometry only. No pixels, window titles, accessibility or input events.
        NSArray *windows = CFBridgingRelease(CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID));
        double largest = 0;
        NSMutableArray *storeWindows = [NSMutableArray array];
        for (NSDictionary *window in windows) {
            NSNumber *owner = window[(__bridge NSString *)kCGWindowOwnerPID];
            NSInteger layer = [window[(__bridge NSString *)kCGWindowLayer] integerValue];
            if (owner.intValue == storePID) {
                NSDictionary *rect = windowRect(window);
                if (!rect) continue;
                [storeWindows addObject:rect];
                double area = [rect[@"width"] doubleValue] * [rect[@"height"] doubleValue];
                if (layer == 0 && area > largest) {
                    largest = area;
                    mainWindow = rect;
                }
                continue;
            }
            NSString *ownerName = window[(__bridge NSString *)kCGWindowOwnerName];
            if (![ownerName hasSuffix:@"PaymentAuthorizationUIExtension"] &&
                ![ownerName isEqualToString:@"Payment Authorization UI"]) continue;
            NSDictionary *rect = windowRect(window);
            if (rect) [paymentWindows addObject:rect];
        }
        // Older Store releases can own their sheet directly. Windows above the
        // main Store window may include confirmations, menus or sign-in sheets.
        for (NSDictionary *rect in storeWindows) {
            if ([rect isEqual:mainWindow]) break;
            double area = [rect[@"width"] doubleValue] * [rect[@"height"] doubleValue];
            if (mainWindow && area > largest * 0.9) continue;
            [paymentWindows addObject:rect];
        }
    }
    NSDictionary *report = @{@"store": @(storePID != 0), @"storeWindow": mainWindow ?: NSNull.null,
                             @"paymentWindows": paymentWindows};
    if ([report isEqual:lastReport]) return;
    lastReport = report;
    NSData *data = [NSJSONSerialization dataWithJSONObject:report options:0 error:NULL];
    if (!data) return;
    fwrite(data.bytes, 1, data.length, stdout);
    puts("");
    fflush(stdout);
}

int main(void)
{
    @autoreleasepool {
        pid_t petPID = getppid();
        NSWorkspace *workspace = NSWorkspace.sharedWorkspace;
        __block pid_t storePID = 0;
        void (^update)(NSRunningApplication *) = ^(NSRunningApplication *application) {
            if ([application.bundleIdentifier isEqualToString:@"com.apple.AppStore"]) {
                storePID = application.processIdentifier;
            } else if (application && application.processIdentifier != petPID &&
                       application.activationPolicy == NSApplicationActivationPolicyRegular) {
                storePID = 0;
            }
            // The Store remains protected while its sheet or the pet has focus.
            if (storePID) {
                NSRunningApplication *store = [NSRunningApplication runningApplicationWithProcessIdentifier:storePID];
                if (!store || store.terminated) storePID = 0;
            }
            reportStoreWindows(storePID);
        };
        [workspace.notificationCenter
            addObserverForName:NSWorkspaceDidActivateApplicationNotification
            object:nil queue:NSOperationQueue.mainQueue
            usingBlock:^(NSNotification *notification) {
                update(notification.userInfo[NSWorkspaceApplicationKey]);
            }];

        // The parent holds this pipe open. Exit if it closes, even after an abnormal quit.
        NSFileHandle.fileHandleWithStandardInput.readabilityHandler = ^(NSFileHandle *input) {
            if (input.availableData.length == 0) _exit(0);
        };
        update(workspace.frontmostApplication);
        [NSTimer scheduledTimerWithTimeInterval:0.2 repeats:YES block:^(NSTimer *timer) {
            update(workspace.frontmostApplication);
        }];
        [NSRunLoop.mainRunLoop run];
    }
    return 0;
}
